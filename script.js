// ==================================================================
// ⚠️ BURAYA KENDİ DAĞITIM (WEB APP) URL'NİZİ YAPIŞTIRIN
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxSVYVlNCWjSMrjjKYgwhCH7qM87szHW49wdMH2_TwL5EHbVb398HJUxeCPVC-M2DOo/exec'; 

// Global Değişkenler
let questionsSource = []; 
let activeQuestions = [];
let studentName = "", studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60; 
let examTimerInterval, hintTimeout; 
let isExamActive = false;
let hasAttemptedFullscreen = false;

// BAŞLANGIÇ
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    if(localStorage.getItem('examSession')) localStorage.removeItem('examSession');

    // Soruları Çek
    fetch(GOOGLE_SCRIPT_URL)
    .then(r => r.json())
    .then(data => {
        if(data.error) throw new Error(data.error);
        questionsSource = data;
        
        if(!questionsSource || questionsSource.length === 0) {
             startBtn.innerText = "Soru Yok (Admin İle Görüşün)";
             startBtn.disabled = false; // Admin girebilsin diye açık bırakıyoruz
        } else {
            startBtn.innerText = "Sınavı Başlat"; 
            startBtn.disabled = false;
        }
    }).catch(e => {
        startBtn.innerText = "Sınavı Başlat (Offline/Hata)";
        startBtn.disabled = false;
        console.error(e);
    });

    // Anti-Cheat
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.onkeydown = function(e) { if(e.keyCode == 123 || (e.ctrlKey && e.keyCode == 85)) return false; };
});

// Yardımcılar
function obfuscateAnswer(answer) { try { return btoa(encodeURIComponent(answer)).split("").reverse().join(""); } catch(e) { return answer; } }
function deobfuscateAnswer(obfuscated) { try { return decodeURIComponent(atob(obfuscated.split("").reverse().join(""))); } catch(e) { return obfuscated; } }

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.mozRequestFullScreen) return elem.mozRequestFullScreen();
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen();
    if (elem.msRequestFullscreen) return elem.msRequestFullscreen();
    return Promise.resolve(); // Hata vermesin diye resolve dönüyoruz
}

// ==================================================================
// KONTROLLÜ GİRİŞ VE BAŞLATMA
// ==================================================================
async function startQuizAttempt() {
    const nameInput = document.getElementById('studentName');
    const idInput = document.getElementById('studentId');
    const startBtn = document.getElementById('startBtn');

    const id = idInput.value.toString().trim();

    if (id.length !== 9) { 
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Öğrenci numarası 9 haneli olmalıdır.' });
        return;
    }

    startBtn.disabled = true;
    const originalText = startBtn.innerText;
    startBtn.innerText = "Kontrol Ediliyor... 🔄";

    try {
        // SUNUCUDAN İZİN İSTE
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "CHECK_ACCESS", Numara: id })
        });
        const result = await response.json();

        // 1. HATA VARSA
        if (result.status === "error") {
            Swal.fire({ icon: 'error', title: 'Giriş Başarısız', text: result.message });
            startBtn.disabled = false;
            startBtn.innerText = originalText;
            return;
        }

        // 2. BAŞARILIYSA
        studentName = result.name; 
        studentNumber = id;

        // Tam Ekran Denemesi (Hata verirse yoksay ve devam et)
        try { await openFullscreen(); } catch(e) {}

        setTimeout(() => {
            hasAttemptedFullscreen = true;
            initializeQuiz();
        }, 300);

    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Bağlantı Hatası', text: 'Sistem URL hatası veya internet yok.' });
        startBtn.disabled = false;
        startBtn.innerText = originalText;
    }
}

function initializeQuiz() {
    isExamActive = true; 
    
    if(!questionsSource || questionsSource.length === 0) {
        Swal.fire('Soru Yok', 'Sistemde yüklü soru bulunamadı.', 'warning');
        return;
    }

    let shuffledQuestions = shuffleArray([...questionsSource]);

    activeQuestions = shuffledQuestions.map(q => {
        let optionsWithIndex = q.options.map((opt, idx) => ({val: opt, originalIdx: idx}));
        let shuffledOptionsMap = shuffleArray(optionsWithIndex);
        let finalOptions = shuffledOptionsMap.map(o => o.val);
        
        let newAnswerIndex;
        if(q.type === 'text') newAnswerIndex = q.answer;
        else newAnswerIndex = shuffledOptionsMap.findIndex(o => o.originalIdx.toString() === q.answer.toString());
        
        return {
            ...q,
            options: finalOptions,
            _secureAnswer: obfuscateAnswer(newAnswerIndex !== -1 ? newAnswerIndex.toString() : ""),
            topic: q.topic || "Genel", image: q.image || ""
        };
    });

    userAnswers = new Array(activeQuestions.length).fill(null);
    localStorage.setItem('examSession', JSON.stringify({name: studentName, id: studentNumber, answers: userAnswers}));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    showQuestion(0);
    if(examTimerInterval) clearInterval(examTimerInterval);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// SORU GÖSTERİMİ
function showQuestion(index) {
    document.getElementById('agentBox').classList.add('hidden');
    const card = document.getElementById('currentQuestionCard');
    card.classList.remove('slide-in');
    
    setTimeout(() => {
        const progress = ((index + 1) / activeQuestions.length) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;

        const q = activeQuestions[index];
        document.getElementById('qIndex').innerText = `SORU ${index + 1} / ${activeQuestions.length}`;
        document.getElementById('qText').innerHTML = q.question; 
        
        const imgEl = document.getElementById('qImage');
        if (q.image && q.image.startsWith('http')) { imgEl.src = q.image; imgEl.classList.remove('hidden'); }
        else { imgEl.src = ""; imgEl.classList.add('hidden'); }

        renderOptions(q, index);

        const btn = document.getElementById('nextBtn');
        if (index === activeQuestions.length - 1) {
            btn.innerText = "Sınavı Bitir ✅";
            btn.onclick = confirmFinishQuiz;
        } else {
            btn.innerText = "Sonraki Soru ➡️";
            btn.onclick = nextQuestion;
        }

        if(q.hint) {
            if(hintTimeout) clearTimeout(hintTimeout);
            hintTimeout = setTimeout(() => { 
                document.getElementById('agentBox').classList.remove('hidden'); 
                document.getElementById('agentText').innerText = q.hint; 
            }, 45000);
        }
        
        card.classList.add('slide-in'); 
        if(window.MathJax) MathJax.typesetPromise([card]).catch(e=>{});
    }, 50); 
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 
    const currentUserAnswer = userAnswers[index];

    if (q.type === 'text') {
        div.innerHTML = `<textarea class="text-answer-input" rows="3" placeholder="Cevap..." oninput="saveAnswer(${index}, this.value.trim())">${currentUserAnswer || ''}</textarea>`;
    } else if (q.type === 'checkbox') {
        let selectedIndices = currentUserAnswer ? JSON.parse(currentUserAnswer) : [];
        q.options.forEach((opt, i) => {
            const isChecked = selectedIndices.includes(i);
            div.innerHTML += `<label class="${isChecked?'selected':''}" onclick="toggleCheckbox(this,${index},${i})"><input type="checkbox" ${isChecked?'checked':''}><span>${opt}</span></label>`;
        });
    } else {
        q.options.forEach((opt, i) => {
            const isChecked = (currentUserAnswer !== null && parseInt(currentUserAnswer) === i);
            div.innerHTML += `<label class="${isChecked?'selected':''}" onclick="selectRadio(this,${index},${i})"><input type="radio" name="opt${index}" ${isChecked?'checked':''}><span>${opt}</span></label>`;
        });
    }
}

function saveAnswer(index, value) {
    userAnswers[index] = value;
    let session = JSON.parse(localStorage.getItem('examSession')) || {};
    session.answers = userAnswers;
    localStorage.setItem('examSession', JSON.stringify(session));
}

function selectRadio(el, qIdx, optIdx) {
    el.parentNode.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
    el.classList.add('selected'); el.querySelector('input').checked = true;
    saveAnswer(qIdx, optIdx.toString());
}

function toggleCheckbox(el, qIdx, optIdx) {
    const cb = el.querySelector('input'); cb.checked = !cb.checked;
    cb.checked ? el.classList.add('selected') : el.classList.remove('selected');
    let sel = userAnswers[qIdx] ? JSON.parse(userAnswers[qIdx]) : [];
    cb.checked ? sel.push(optIdx) : (sel = sel.filter(x => x !== optIdx));
    saveAnswer(qIdx, JSON.stringify(sel));
}

function nextQuestion() { currentQuestionIndex++; showQuestion(currentQuestionIndex); }

function confirmFinishQuiz() {
    Swal.fire({
        title: 'Sınavı Bitir?', icon: 'question', showCancelButton: true, confirmButtonText: 'Bitir ✅', cancelButtonText: 'İptal'
    }).then((r) => { if (r.isConfirmed) finishQuiz('NORMAL'); });
}

// ZAMANLAYICI & BİTİŞ
function startExamTimer() {
    totalTimeLeft = 30 * 60;
    const timerEl = document.getElementById('timer');
    const timerCon = document.getElementById('timerContainer');
    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) finishQuiz("TIMEOUT");
        else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft/60), s = totalTimeLeft%60;
            timerEl.innerText = `${m}:${s<10?'0'+s:s}`;
            totalTimeLeft < 60 ? timerCon.classList.add('timer-urgent') : timerCon.classList.remove('timer-urgent');
        }
    }, 1000);
}

function finishQuiz(type) {
    if(!isExamActive) return;
    isExamActive = false; 
    clearInterval(examTimerInterval); clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    localStorage.removeItem('examSession'); 
    if(document.fullscreenElement) document.exitFullscreen().catch(e=>{});

    let score = 0, topicStats = {};
    const pts = 100 / activeQuestions.length;

    activeQuestions.forEach((q, i) => {
        if(!topicStats[q.topic]) topicStats[q.topic] = {total:0, correct:0};
        topicStats[q.topic].total++;
        if (type !== "CHEATING_TAB" && type !== "CHEATING_ESC") {
            const correct = deobfuscateAnswer(q._secureAnswer);
            const user = userAnswers[i];
            let isOk = false;
            if (q.type === 'checkbox') {
                 const uS = user ? JSON.parse(user).sort().join(',') : "";
                 const cS = q.answer ? q.answer.split(',').map(s=>s.trim()).sort().join(',') : "";
                 isOk = (uS === cS && uS !== "");
            } else if (q.type === 'text') isOk = (user && user.toLowerCase() === correct.toLowerCase());
            else isOk = (user === correct);

            if (isOk) { score += pts; topicStats[q.topic].correct++; }
        }
    });
    score = Math.round(score);

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    let statusNote = "Normal", weakTopic = "";
    const fb = document.getElementById('feedbackMessage');

    if (type.startsWith("CHEATING")) {
        fb.innerHTML = `⚠️ SINAV İPTAL!<br>Sebep: Güvenlik İhlali`; fb.style.color = "#ef4444"; statusNote = "KOPYA";
    } else if (type === "TIMEOUT") {
        fb.innerText = "⏰ Süre Doldu."; fb.style.color = "#f59e0b"; statusNote = "SURE_BITTI";
        generateAnalysis(topicStats); generateReviewPanel();
    } else if (score >= 50) {
        fb.innerText = "Tebrikler! Geçtiniz. 🎉"; fb.style.color = "#10b981";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
        document.getElementById('authCode').innerText = Math.random().toString(36).substring(2, 8).toUpperCase();
        generateAnalysis(topicStats); generateReviewPanel();
    } else {
        fb.innerText = "Maalesef kaldınız."; fb.style.color = "#6b7280"; 
        generateAnalysis(topicStats); generateReviewPanel();
    }

    sendToGoogleSheets({type:"RESULT", Isim:studentName, Numara:studentNumber, Puan:score, Durum:statusNote, Zayif_Konu:weakTopic}, fb);
}

function handleVisibilityChange() { if(document.hidden && isExamActive) finishQuiz("CHEATING_TAB"); }
function handleFullscreenChange() { if(!document.fullscreenElement && isExamActive && hasAttemptedFullscreen) finishQuiz("CHEATING_ESC"); }

// ANALİZ VE RAPOR
function generateAnalysis(stats) {
    let weak=[], strong=[], msg="";
    for(let t in stats) {
        let r = (stats[t].correct/stats[t].total)*100;
        if(r<50) weak.push(t); else if(r>=80) strong.push(t);
    }
    if(strong.length) msg += `🌟 Güçlü: ${strong.join(", ")}<br>`;
    if(weak.length) msg += `⚠️ Geliştir: ${weak.join(", ")}`;
    if(msg) { document.getElementById('analysisBox').classList.remove('hidden'); document.getElementById('analysisText').innerHTML = msg; }
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea'); div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        const c = deobfuscateAnswer(q._secureAnswer);
        const u = userAnswers[i];
        let ok = false, uDisp = "", cDisp = "";

        if(q.type === 'text') { ok = (u && u.toLowerCase()===c.toLowerCase()); uDisp=u||"(Boş)"; cDisp=c; }
        else if(q.type === 'checkbox') {
            const uS = u?JSON.parse(u).sort().join(','):""; const cS = q.answer?q.answer.split(',').map(s=>s.trim()).sort().join(','):"";
            ok = (uS===cS && uS!==""); uDisp=u?JSON.parse(u).map(x=>q.options[x]).join(", "):"(Boş)"; cDisp=q.answer?q.answer.split(',').map(x=>q.options[parseInt(x)]).join(", "):"";
        } else { ok=(u===c); uDisp=u!==null?q.options[parseInt(u)]:"(Boş)"; cDisp=q.options[parseInt(c)]; }

        div.innerHTML += `<div class="review-item ${ok?'correct':'wrong'}"><b>${i+1}. ${q.question}</b><br>Siz: ${uDisp}<br>Doğru: ${cDisp}</div>`;
    });
    if(window.MathJax) MathJax.typesetPromise([div]).catch(()=>{});
}

function sendToGoogleSheets(data, fb) { fetch(GOOGLE_SCRIPT_URL, {method:"POST", body:JSON.stringify(data)}).then(r=>r.json()).then(d=>{ if(d.status==='success') fb.innerHTML+=" ✅"; }); }

// ADMIN (Şifre: zeynep1605)
function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }

function adminLoginAttempt() {
    const p = document.getElementById('adminPass').value.trim();
    if(p === "zeynep1605") {
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminControls').classList.remove('hidden');
        Swal.fire({toast:true, icon:'success', title:'Hoş geldin Yönetici', timer:1500, showConfirmButton:false});
    } else {
        Swal.fire('Hatalı Şifre');
    }
}

function uploadQuestions() {
    try {
        const j = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(j)) throw 0;
        document.getElementById('adminStatus').innerText = "Yükleniyor...";
        fetch(GOOGLE_SCRIPT_URL, {method:"POST", body:JSON.stringify({type:"ADD_BULK", questions:j})}).then(r=>r.json()).then(d=>{
            document.getElementById('adminStatus').innerText = d.status==='success' ? "Yüklendi ✅" : "Hata";
        });
    } catch { Swal.fire('JSON Hatası (Formatı Kontrol Edin)'); }
}
function deleteQuestions() { fetch(GOOGLE_SCRIPT_URL, {method:"POST", body:JSON.stringify({type:"DELETE_ALL"})}).then(()=>Swal.fire('Tüm Veriler Silindi')); }
function reportObjection() { Swal.fire('Bildiriminiz İletildi.'); } 
function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }