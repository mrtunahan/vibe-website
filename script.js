// ==================================================================
// ⚠️ DİKKAT: BURADAKİ URL SİZİN KENDİ APPSCRIPT URL'NİZ OLMALI
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyugM8oTyJaGRaW5Ab0WvIf4bMN24kvowqYX7nluYIB8VJcFYEv1DyBWoawSrPwYIAm/exec';

// Global değişkenler
let questionsSource = [];
let activeQuestions = [];
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0;
let userAnswers = [];
let totalTimeLeft = 30 * 60; 
let examTimerInterval = null;
let hintTimeout = null;
let isExamActive = false;
let hasAttemptedFullscreen = false;

// -----------------------------------------------------
// BAŞLANGIÇ & EVENT LISTENERLAR
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const studentIdInput = document.getElementById('studentId');
    
    // 1. SORULARI ÇEK
    fetch(GOOGLE_SCRIPT_URL)
        .then(r => r.json())
        .then(data => {
            if (Array.isArray(data)) questionsSource = data;
            
            if (!questionsSource || questionsSource.length === 0) {
                startBtn.innerText = "Soru Yok (Yönetici Girişi Yapın)";
            } else {
                startBtn.innerText = "Giriş Yap ve Başlat";
            }
        })
        .catch(err => {
            console.error("Veri hatası:", err);
            startBtn.innerText = "Bağlantı Hatası (Sayfayı Yenile)";
        });

    // 2. OTOMATİK İSİM GETİRME (Kullanıcı numarayı yazıp çıkınca çalışır)
    studentIdInput.addEventListener('blur', async function() {
        const numara = this.value.trim();
        const nameDisplay = document.getElementById('studentNameDisplay');

        if(numara.length === 9) {
            nameDisplay.value = "İsim aranıyor...";
            try {
                // Sadece isim kontrolü için hafif bir istek atıyoruz
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({ type: "CHECK_ACCESS", Numara: numara })
                });
                const result = await response.json();
                
                if(result.status === "success" && result.name) {
                    nameDisplay.value = result.name;
                    studentName = result.name; // Global değişkeni güncelle
                } else {
                    nameDisplay.value = "Kayıt bulunamadı!";
                }
            } catch (error) {
                nameDisplay.value = "Bağlantı hatası!";
            }
        }
    });

    // Güvenlik önlemleri
    document.addEventListener("visibilitychange", () => { if(document.hidden && isExamActive) finishQuiz("CHEATING_TAB"); });
    document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && isExamActive && hasAttemptedFullscreen) finishQuiz("CHEATING_ESC"); });
    document.onkeydown = function (e) { if (e.keyCode === 123 || (e.ctrlKey && e.keyCode === 85)) return false; };
});

// -----------------------------------------------------
// YARDIMCI FONKSİYONLAR
// -----------------------------------------------------
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function obfuscateAnswer(answer) {
    try { return btoa(encodeURIComponent(answer)).split("").reverse().join(""); } catch (e) { return answer; }
}
function deobfuscateAnswer(obf) {
    try { return decodeURIComponent(atob(obf.split("").reverse().join(""))); } catch (e) { return obf; }
}

function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen();
    return Promise.resolve();
}

// -----------------------------------------------------
// GİRİŞ VE BAŞLATMA (DÜZELTİLDİ: DONMA SORUNU ÇÖZÜLDÜ)
// -----------------------------------------------------
async function startQuizAttempt() {
    const idInput = document.getElementById('studentId');
    const startBtn = document.getElementById('startBtn');
    const id = idInput.value.toString().trim();

    // Validasyon
    if (id.length !== 9) {
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Öğrenci numarası 9 haneli olmalıdır.' });
        return;
    }

    // Butonu Kilitle
    startBtn.disabled = true;
    const originalText = startBtn.innerText;
    startBtn.innerText = "Kontrol Ediliyor... 🔄";

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "CHECK_ACCESS", Numara: id })
        });
        
        // Yanıtın JSON olup olmadığını kontrol et
        if (!response.ok) throw new Error("Sunucu hatası");
        
        const result = await response.json();

        if (result.status === "error") {
            Swal.fire({ icon: 'error', title: 'Giriş Başarısız', text: result.message });
        } else {
            // Başarılı Giriş
            studentName = result.name;
            studentNumber = id;
            
            // Tam ekrana geçmeyi dene
            try { await openFullscreen(); } catch (e) { console.log("Tam ekran reddedildi"); }

            // Sınavı başlat
            setTimeout(() => {
                hasAttemptedFullscreen = true;
                initializeQuiz();
            }, 500);
            
            // Başarılı olursa butonu resetlemeye gerek yok, ekran değişecek
            return; 
        }

    } catch (e) {
        console.error(e);
        Swal.fire({ 
            icon: 'error', 
            title: 'Hata', 
            text: 'Sunucuya bağlanılamadı veya internet kesildi. Lütfen tekrar deneyin.' 
        });
    } finally {
        // Hata durumunda veya başarısız girişte butonu eski haline getir (DONMAYI ENGELLER)
        startBtn.disabled = false;
        startBtn.innerText = originalText;
    }
}

// -----------------------------------------------------
// SINAV MANTIĞI
// -----------------------------------------------------
function initializeQuiz() {
    if (!questionsSource || questionsSource.length === 0) {
        Swal.fire('Uyarı', 'Sistemde soru bulunamadı. Lütfen yönetici panelinden soru yükleyin.', 'warning');
        return;
    }

    isExamActive = true;
    const shuffledQuestions = shuffleArray([...questionsSource]);

    activeQuestions = shuffledQuestions.map(q => {
        const optionsWithIndex = (q.options || []).map((opt, idx) => ({ val: opt, originalIdx: idx }));
        const shuffledOptionsMap = shuffleArray(optionsWithIndex);
        const finalOptions = shuffledOptionsMap.map(o => o.val);

        let newAnswerIndex = "";
        if (q.type === 'text') {
            newAnswerIndex = q.answer;
        } else {
            const originalAnsStr = (q.answer !== undefined && q.answer !== null) ? q.answer.toString() : "";
            if(q.type === 'checkbox' && originalAnsStr.includes(',')) {
                newAnswerIndex = originalAnsStr; 
            } else {
                const found = shuffledOptionsMap.findIndex(o => o.originalIdx.toString() === originalAnsStr);
                newAnswerIndex = found !== -1 ? found : "";
            }
        }

        return {
            ...q,
            options: finalOptions,
            _secureAnswer: obfuscateAnswer(newAnswerIndex.toString()),
            topic: q.topic || "Genel",
            image: q.image || ""
        };
    });

    userAnswers = new Array(activeQuestions.length).fill(null);
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;
    currentQuestionIndex = 0;
    showQuestion(0);
    startExamTimer();
}

function showQuestion(index) {
    const q = activeQuestions[index];
    const progress = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('qIndex').innerText = `SORU ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerHTML = q.question;

    const imgEl = document.getElementById('qImage');
    if (q.image && q.image.startsWith('http')) { imgEl.src = q.image; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }

    renderOptions(q, index);

    const nextBtn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        nextBtn.innerText = "Sınavı Bitir ✅";
        nextBtn.onclick = confirmFinishQuiz;
    } else {
        nextBtn.innerText = "Sonraki Soru ➡️";
        nextBtn.onclick = () => { currentQuestionIndex++; showQuestion(currentQuestionIndex); };
    }
    
    // İpucu
    const agentBox = document.getElementById('agentBox');
    agentBox.classList.add('hidden');
    if(hintTimeout) clearTimeout(hintTimeout);
    if(q.hint) {
        hintTimeout = setTimeout(() => {
            document.getElementById('agentText').innerText = q.hint;
            agentBox.classList.remove('hidden');
        }, 45000); // 45 Saniye sonra ipucu
    }
    
    if (window.MathJax) MathJax.typesetPromise([document.getElementById('quizScreen')]).catch(()=>{});
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = "";
    const currentAns = userAnswers[index];

    if (q.type === 'text') {
        div.innerHTML = `<textarea class="text-answer-input" rows="3" oninput="userAnswers[${index}]=this.value.trim()">${currentAns||''}</textarea>`;
    } else if (q.type === 'checkbox') {
        let sel = currentAns ? JSON.parse(currentAns) : [];
        q.options.forEach((opt, i) => {
            const isChk = sel.includes(i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="checkbox" ${isChk?'checked':''}><span>${opt}</span>`;
            lbl.onclick = (e) => {
                if(e.target.tagName!=='INPUT') lbl.querySelector('input').click();
            };
            lbl.querySelector('input').onchange = (e) => {
                if(e.target.checked) sel.push(i); else sel = sel.filter(x=>x!==i);
                userAnswers[index] = JSON.stringify(sel);
                renderOptions(q, index); 
            };
            div.appendChild(lbl);
        });
    } else { // Radio
        q.options.forEach((opt, i) => {
            const isChk = (currentAns !== null && parseInt(currentAns) === i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="radio" name="opt${index}" ${isChk?'checked':''}><span>${opt}</span>`;
            lbl.onclick = () => { userAnswers[index] = i.toString(); renderOptions(q, index); };
            div.appendChild(lbl);
        });
    }
}

// -----------------------------------------------------
// ZAMANLAYICI & BİTİŞ
// -----------------------------------------------------
function startExamTimer() {
    totalTimeLeft = 30 * 60;
    examTimerInterval = setInterval(() => {
        if (totalTimeLeft <= 0) { finishQuiz("TIMEOUT"); return; }
        totalTimeLeft--;
        const m = Math.floor(totalTimeLeft/60);
        const s = totalTimeLeft%60;
        document.getElementById('timer').innerText = `${m}:${s<10?'0'+s:s}`;
    }, 1000);
}

function confirmFinishQuiz() {
    Swal.fire({ title: 'Bitir?', icon: 'question', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'Hayır' })
        .then((r) => { if (r.isConfirmed) finishQuiz('NORMAL'); });
}

function finishQuiz(type) {
    if (!isExamActive) return;
    isExamActive = false;
    clearInterval(examTimerInterval);
    if(hintTimeout) clearTimeout(hintTimeout);
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});

    let score = 0;
    const pts = 100 / activeQuestions.length;

    activeQuestions.forEach((q, i) => {
        if(type.startsWith("CHEATING")) return;

        const correct = deobfuscateAnswer(q._secureAnswer);
        const user = userAnswers[i];
        let isOk = false;

        if (q.type === 'text') {
            isOk = (user && user.toLowerCase() === correct.toLowerCase());
        } else if (q.type === 'checkbox') {
             isOk = (user === correct); 
        } else {
            isOk = (user === correct);
        }

        if (isOk) score += pts;
    });

    score = Math.round(score);

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    if (type.startsWith("CHEATING")) {
        fb.innerHTML = "⚠️ KOPYA GİRİŞİMİ - SINAV İPTAL";
        fb.style.color = "red";
        statusNote = "KOPYA";
    } else if (score >= 50) {
        fb.innerHTML = "Tebrikler! Geçtiniz 🎉";
        fb.style.color = "green";
    } else {
        fb.innerHTML = "Kaldınız.";
    }

    generateReviewPanel();

    sendToGoogleSheets({
        type: "RESULT",
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote
    });
}

// -----------------------------------------------------
// CEVAP ANAHTARI & YÖNETİCİ PANELİ
// -----------------------------------------------------
function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        const correctIdx = deobfuscateAnswer(q._secureAnswer);
        const userIdx = userAnswers[i];
        
        let userDisp = "(Boş)", correctDisp = "";
        let isCorrect = false;

        if(q.type === 'text') {
            userDisp = userIdx || "(Boş)";
            correctDisp = correctIdx;
            isCorrect = (userDisp.toLowerCase() === correctDisp.toLowerCase());
        } else {
            userDisp = (userIdx !== null && q.options[userIdx]) ? q.options[userIdx] : "(Boş)";
            correctDisp = q.options[correctIdx] ? q.options[correctIdx] : "Hata";
            isCorrect = (userIdx === correctIdx);
        }

        const row = document.createElement('div');
        row.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;
        row.innerHTML = `<b>${i+1}. ${q.question}</b><br>Siz: ${userDisp}<br>Doğru: ${correctDisp}`;
        div.appendChild(row);
    });
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }

function sendToGoogleSheets(data) {
    fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(data) });
}

// --- YÖNETİCİ FONKSİYONLARI ---
function toggleAdmin() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
}

function closeAdmin() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
}

function adminLoginAttempt() {
    const p = document.getElementById('adminPass').value;
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
        const json = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(json)) throw new Error();
        
        document.getElementById('adminStatus').innerText = "Yükleniyor...";
        
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "ADD_BULK", questions: json })
        })
        .then(r => r.json())
        .then(d => {
            if(d.status === 'success') document.getElementById('adminStatus').innerText = "Başarılı ✅";
            else document.getElementById('adminStatus').innerText = "Hata oluştu.";
        });
    } catch {
        Swal.fire('JSON Formatı Hatalı');
    }
}

function deleteQuestions() {
    if(!confirm("Tüm sorular silinsin mi?")) return;
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "DELETE_ALL" })
    }).then(() => Swal.fire('Silindi'));
}