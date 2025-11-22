// ------------------------------------------------------------------
// ⚠️ YENİ GOOGLE APPS SCRIPT URL'NİZ
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyVEo9-tPQK2DYcCbxejVSJ_wPiC8AsznQ-kJSEYQDsspPKzgBSOtnUpi0eAap8FV6w/exec'; 

// --- Global Değişkenler ---
let questionsSource = []; 
let activeQuestions = [];
let studentName = "", studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60; // 30 Dakika
let examTimerInterval, hintTimeout; 
let isExamActive = false;
let hasAttemptedFullscreen = false;

// --- Admin Şifresi Hash'i (SHA-256: "zeynep1605") ---
const ADMIN_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

// --- BAŞLANGIÇ: Verileri Yükle ---
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    
    // Eski oturumu temizle
    const savedSession = localStorage.getItem('examSession');
    if(savedSession) {
       localStorage.removeItem('examSession');
    }

    fetch(GOOGLE_SCRIPT_URL)
    .then(r => r.json())
    .then(data => {
        if(data.error) { throw new Error(data.error); }
        questionsSource = data;
        if(questionsSource.length === 0) {
             startBtn.innerText = "Soru Bulunamadı (Yönetici ile görüşün)";
        } else {
            startBtn.innerText = "Sınavı Başlat"; startBtn.disabled = false;
            console.log(`${questionsSource.length} soru yüklendi.`);
        }
    }).catch(e => {
        startBtn.innerText = "Bağlantı Hatası! Sayfayı Yenileyin.";
        startBtn.style.background = "#ef4444";
        console.error("Veri çekme hatası:", e);
    });

    // Anti-Cheat: Tam ekran değişimini izle
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange); // Firefox desteği
    document.addEventListener("MSFullscreenChange", handleFullscreenChange); // IE/Edge desteği

    // Anti-Cheat: Klavye kısayollarını engelle
    document.onkeydown = function(e) {
        if(e.keyCode == 123 || (e.ctrlKey && e.keyCode == 85)) { return false; }
    };
});

// --- GÜVENLİK: Basit Cevap Gizleme ---
function obfuscateAnswer(answer) {
    try { return btoa(encodeURIComponent(answer)).split("").reverse().join(""); } catch(e) { return answer; }
}
function deobfuscateAnswer(obfuscated) {
    try { return decodeURIComponent(atob(obfuscated.split("").reverse().join(""))); } catch(e) { return obfuscated; }
}

// --- YARDIMCI: Karıştır ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- DÜZELTİLMİŞ TAM EKRAN FONKSİYONU ---
function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.mozRequestFullScreen) return elem.mozRequestFullScreen(); // Firefox
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen(); // Chrome, Safari & Opera
    if (elem.msRequestFullscreen) return elem.msRequestFullscreen(); // IE/Edge
    return Promise.reject("Tarayıcı desteklemiyor");
}

// --- GÜNCELLENMİŞ SINAV BAŞLATMA ---
async function startQuizAttempt() {
    const name = document.getElementById('studentName').value.trim();
    const id = document.getElementById('studentId').value.toString();

    // 1. Bilgi Kontrolü
    if (name.length < 3 || id.length !== 9) { 
        Swal.fire({ icon: 'error', title: 'Eksik Bilgi', text: 'Lütfen adınızı ve 9 haneli öğrenci numaranızı doğru giriniz.' });
        return;
    }

    // 2. Zaten tam ekranda mı kontrol et (Örneğin F11 basmışsa)
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
        hasAttemptedFullscreen = true;
        initializeQuiz(name, id);
        return;
    }

    // 3. Değilse Tam Ekrana Sokmayı Dene
    try {
        await openFullscreen();
        
        // Tarayıcının moda geçmesi için milisaniyelik bir gecikme tanı
        setTimeout(() => {
            hasAttemptedFullscreen = true;
            initializeQuiz(name, id);
        }, 100);

    } catch (err) {
        console.error("Tam ekran hatası:", err);
        
        // Eğer otomatik geçişe izin vermezse kullanıcıya manuel yapmasını söyle
        Swal.fire({ 
            icon: 'warning', 
            title: 'İzin Gerekli', 
            text: 'Tarayıcı otomatik tam ekrana geçemedi. Lütfen klavyeden F11 tuşuna basarak tam ekrana geçin ve tekrar butona tıklayın.',
            confirmButtonText: 'Tamam'
        });
    }
}

function initializeQuiz(name, id) {
    studentName = name; studentNumber = id; isExamActive = true; 

    let shuffledQuestions = shuffleArray([...questionsSource]);

    activeQuestions = shuffledQuestions.map(q => {
        let optionsWithIndex = q.options.map((opt, idx) => ({val: opt, originalIdx: idx}));
        let shuffledOptionsMap = shuffleArray(optionsWithIndex);
        
        let finalOptions = shuffledOptionsMap.map(o => o.val);
        let newAnswerIndex = q.type === 'text' ? q.answer : shuffledOptionsMap.findIndex(o => o.originalIdx.toString() === q.answer.toString());
        
        return {
            ...q,
            options: finalOptions,
            _secureAnswer: obfuscateAnswer(newAnswerIndex !== -1 ? newAnswerIndex.toString() : ""),
            topic: q.topic || "Genel", image: q.image || ""
        };
    });

    userAnswers = new Array(activeQuestions.length).fill(null);
    localStorage.setItem('examSession', JSON.stringify({name, id, answers: userAnswers, startTime: Date.now()}));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    showQuestion(0);
    
    if(examTimerInterval) clearInterval(examTimerInterval);
    startExamTimer();

    document.addEventListener("visibilitychange", handleVisibilityChange);
}


// --- SORU GÖSTERİMİ ---
function showQuestion(index) {
    hideAgent();
    const card = document.getElementById('currentQuestionCard');
    card.classList.remove('slide-in');
    
    setTimeout(() => {
        const progress = ((index + 1) / activeQuestions.length) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;

        const q = activeQuestions[index];
        document.getElementById('qIndex').innerText = `SORU ${index + 1}/${activeQuestions.length}`;
        document.getElementById('qText').innerHTML = q.question; 
        
        const imgEl = document.getElementById('qImage');
        if (q.image && q.image.trim().startsWith('http')) { imgEl.src = q.image; imgEl.classList.remove('hidden'); }
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

        startHintTimer(index);
        card.classList.add('slide-in'); 

        if(window.MathJax) { MathJax.typesetPromise([card]).catch(err => console.log('MathJax Hatası:', err)); }

    }, 50); 
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 
    const currentUserAnswer = userAnswers[index];

    if (q.type === 'text') {
        div.innerHTML = `<textarea class="text-answer-input" rows="3" placeholder="Cevabınızı buraya yazınız..." oninput="saveTextAnswer(${index}, this.value)">${currentUserAnswer || ''}</textarea>`;
    } 
    else if (q.type === 'checkbox') {
        let selectedIndices = currentUserAnswer ? JSON.parse(currentUserAnswer) : [];
        q.options.forEach((opt, i) => {
            const isChecked = selectedIndices.includes(i);
            div.innerHTML += `
                <label class="${isChecked ? 'selected' : ''}" onclick="toggleCheckbox(this, ${index}, ${i})">
                    <input type="checkbox" ${isChecked ? 'checked' : ''}>
                    <span>${opt}</span>
                </label>`;
        });
    } 
    else {
        q.options.forEach((opt, i) => {
            const isChecked = (currentUserAnswer !== null && parseInt(currentUserAnswer) === i);
            div.innerHTML += `
                <label class="${isChecked ? 'selected' : ''}" onclick="selectRadio(this, ${index}, ${i})">
                    <input type="radio" name="question_opt_${index}" ${isChecked ? 'checked' : ''}>
                    <span>${opt}</span>
                </label>`;
        });
    }
}


// --- CEVAP KAYDETME ---
function saveAnswer(index, value) {
    userAnswers[index] = value;
    let session = JSON.parse(localStorage.getItem('examSession')) || {};
    session.answers = userAnswers;
    localStorage.setItem('examSession', JSON.stringify(session));
}

function selectRadio(labelElement, qIdx, optIdx) {
    labelElement.parentNode.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
    labelElement.classList.add('selected');
    labelElement.querySelector('input').checked = true;
    saveAnswer(qIdx, optIdx.toString());
}

function toggleCheckbox(labelElement, qIdx, optIdx) {
    const checkbox = labelElement.querySelector('input');
    checkbox.checked = !checkbox.checked; 
    
    if(checkbox.checked) labelElement.classList.add('selected');
    else labelElement.classList.remove('selected');

    let currentSelection = userAnswers[qIdx] ? JSON.parse(userAnswers[qIdx]) : [];
    if (checkbox.checked) {
        if (!currentSelection.includes(optIdx)) currentSelection.push(optIdx);
    } else {
        currentSelection = currentSelection.filter(id => id !== optIdx);
    }
    saveAnswer(qIdx, JSON.stringify(currentSelection));
}

function saveTextAnswer(qIdx, text) {
    saveAnswer(qIdx, text.trim());
}

function nextQuestion() {
    currentQuestionIndex++;
    showQuestion(currentQuestionIndex);
}

function confirmFinishQuiz() {
    const emptyCount = userAnswers.filter(a => a === null || a === "" || a === "[]").length;
    let warningText = emptyCount > 0 ? `${emptyCount} boş sorunuz var. Yine de bitirmek istiyor musunuz?` : "Sınavı tamamlamak üzeresiniz.";

    Swal.fire({
        title: 'Sınavı Bitir?',
        text: warningText,
        icon: emptyCount > 0 ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonColor: varCss('--primary'),
        cancelButtonColor: '#d33',
        confirmButtonText: 'Evet, Bitir ✅',
        cancelButtonText: 'İptal, Kontrol Et'
    }).then((result) => {
        if (result.isConfirmed) {
            finishQuiz('NORMAL');
        }
    });
}
function varCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }


function reportObjection() {
    const q = activeQuestions[currentQuestionIndex];
    Swal.fire({
        title: 'Soruda Hata Bildir ⚠️',
        input: 'textarea',
        inputLabel: `Soru ${currentQuestionIndex+1} için itiraz sebebiniz:`,
        inputPlaceholder: 'Örn: Yazım hatası var, cevap şıklarda yok...',
        showCancelButton: true,
        confirmButtonText: 'Gönder',
        showLoaderOnConfirm: true,
        preConfirm: (reason) => {
            if (!reason) Swal.showValidationMessage('Lütfen bir sebep yazınız.');
            return fetch(GOOGLE_SCRIPT_URL, {
                method:"POST", 
                body:JSON.stringify({type:"OBJECTION", Isim:studentName, SoruID:q.id, SoruMetni:q.question.substring(0,50)+"...", Sebep:reason})
            })
            .then(response => {
                if (!response.ok) throw new Error(response.statusText);
                return response.json();
            })
            .catch(error => Swal.showValidationMessage(`İstek hatası: ${error}`));
        },
        allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
        if (result.isConfirmed) { Swal.fire({icon:'success', title:'İletildi', text:'Bildiriminiz alındı, teşekkürler.'}); }
    });
}

// --- ZAMANLAYICI VE ANTI-CHEAT ---
function startExamTimer() {
    totalTimeLeft = 30 * 60; 
    const timerEl = document.getElementById('timer');
    const timerContainer = document.getElementById('timerContainer');

    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) {
            finishQuiz("TIMEOUT");
        } else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft/60), s = totalTimeLeft%60;
            timerEl.innerText = `${m}:${s<10?'0'+s:s}`;

            if(totalTimeLeft < 60) timerContainer.classList.add('timer-urgent');
            else timerContainer.classList.remove('timer-urgent');
        }
    }, 1000);
}

function handleVisibilityChange() {
    if(document.hidden && isExamActive) {
        finishQuiz("CHEATING_TAB");
    }
}

function handleFullscreenChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement && isExamActive && hasAttemptedFullscreen) {
        finishQuiz("CHEATING_ESC");
    }
}


// --- SINAV BİTİŞİ ---
function finishQuiz(type) {
    if(!isExamActive) return;
    isExamActive = false; 
    clearInterval(examTimerInterval); 
    clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
    document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    localStorage.removeItem('examSession'); 

    if(document.fullscreenElement) document.exitFullscreen().catch(e=>{});

    let score = 0, topicStats = {};
    const pointsPerQuestion = 100 / activeQuestions.length;

    activeQuestions.forEach((q, i) => {
        if(!topicStats[q.topic]) topicStats[q.topic] = {total:0, correct:0};
        topicStats[q.topic].total++;

        if (type !== "CHEATING_TAB" && type !== "CHEATING_ESC") {
            const correctAnswerDecoded = deobfuscateAnswer(q._secureAnswer);
            const userAnswer = userAnswers[i];
            let isCorrect = false;
            
            if (q.type === 'checkbox') {
                 const userSelections = userAnswer ? JSON.parse(userAnswer).sort().join(',') : "";
                 const correctSelections = q.answer ? q.answer.split(',').map(s=>s.trim()).sort().join(',') : "";
                 isCorrect = (userSelections === correctSelections && userSelections !== "");
            } 
            else if (q.type === 'text') {
                 isCorrect = (userAnswer && userAnswer.toLowerCase() === correctAnswerDecoded.toLowerCase());
            }
            else {
                 isCorrect = (userAnswer === correctAnswerDecoded);
            }

            if (isCorrect) {
                score += pointsPerQuestion;
                topicStats[q.topic].correct++;
            }
        }
    });
    score = Math.round(score);

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "Normal", weakTopic = "";

    if (type.startsWith("CHEATING")) {
        let cheatMsg = type === "CHEATING_TAB" ? "Sekme Değiştirme" : "Tam Ekran İhlali";
        fb.innerHTML = `⚠️ SINAV İPTAL EDİLDİ!<br><span style="font-size:0.9rem">Sebep: Güvenlik İhlali (${cheatMsg})</span>`; 
        fb.style.color = "#ef4444"; statusNote = "KOPYA_" + type;
        Swal.fire({icon:'error', title:'Sınav İptal', text:'Sınav kurallarına uymadığınız tespit edildi.'});
    } else if (type === "TIMEOUT") {
        fb.innerText = "⏰ Süre Doldu."; fb.style.color = "#f59e0b"; statusNote = "SURE_BITTI"; 
        generateReport(topicStats);
        Swal.fire({icon:'info', title:'Süre Doldu', text:'Sınav süreniz bitti.'});
    } else if (score >= 50) {
        fb.innerText = "Tebrikler! Geçtiniz. 🎉"; fb.style.color = "#10b981";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
        document.getElementById('authCode').innerText = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        generateReport(topicStats);
    } else {
        fb.innerText = "Maalesef kaldınız."; fb.style.color = "#6b7280"; generateReport(topicStats);
    }

    function generateReport(stats) {
        weakTopic = generateAnalysis(stats);
        generateReviewPanel();
    }

    sendToGoogleSheets({type:"RESULT", Isim:studentName, Numara:studentNumber, Puan:score, Durum:statusNote, Zayif_Konu:weakTopic}, fb);
}

function generateAnalysis(stats) {
    let weak=[], strong=[], worstRatio=100, worstTopic="-";
    for(let topic in stats) {
        if(stats[topic].total === 0) continue;
        let ratio = (stats[topic].correct / stats[topic].total) * 100;
        if(ratio < worstRatio) { worstRatio=ratio; worstTopic=topic; }
        if(ratio < 50) weak.push(topic); else if(ratio >= 80) strong.push(topic);
    }
    let msg = "";
    if(strong.length>0) msg += `🌟 <strong>Güçlü:</strong> ${strong.join(", ")}<br>`;
    if(weak.length>0) msg += `⚠️ <strong>Geliştir:</strong> ${weak.join(", ")}`;
    
    if(msg) {
        document.getElementById('analysisBox').classList.remove('hidden');
        document.getElementById('analysisText').innerHTML = msg;
    }
    return worstTopic;
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    
    activeQuestions.forEach((q, i) => {
        const correctAnswerDecoded = deobfuscateAnswer(q._secureAnswer);
        const userAnswer = userAnswers[i];
        let isCorrect = false;
        let userAnswerDisplay = "", correctAnswerDisplay = "";

        if (q.type === 'text') {
             isCorrect = (userAnswer && userAnswer.toLowerCase() === correctAnswerDecoded.toLowerCase());
             userAnswerDisplay = userAnswer || "(Boş)";
             correctAnswerDisplay = correctAnswerDecoded;
        }
        else if (q.type === 'checkbox') {
             const userSelections = userAnswer ? JSON.parse(userAnswer).sort().join(',') : "";
             const correctSelections = q.answer ? q.answer.split(',').map(s=>s.trim()).sort().join(',') : "";
             isCorrect = (userSelections === correctSelections && userSelections !== "");
             
             userAnswerDisplay = userAnswer ? JSON.parse(userAnswer).map(idx => q.options[idx]).join(", ") : "(Boş)";
             correctAnswerDisplay = q.answer ? q.answer.split(',').map(idx => q.options[parseInt(idx)]).join(", ") : "Belirtilmemiş";
        }
        else {
             isCorrect = (userAnswer === correctAnswerDecoded);
             userAnswerDisplay = userAnswer !== null ? q.options[parseInt(userAnswer)] : "(Boş)";
             correctAnswerDisplay = q.options[parseInt(correctAnswerDecoded)];
        }

        let content = `<div style="font-weight:bold; margin-bottom:8px;">${i+1}. Soru: ${q.question}</div>`;
        
        if(q.type === 'text' || q.type === 'checkbox') {
            content += `<div style="font-size:0.9rem">Sizin Cevabınız: <span class="${isCorrect?'opt-correct':'opt-wrong'}">${userAnswerDisplay}</span></div>`;
            if(!isCorrect) content += `<div style="font-size:0.9rem; margin-top:4px;">Doğru Cevap: <span class="opt-correct">${correctAnswerDisplay}</span></div>`;
        } else {
             q.options.forEach((opt, idx) => {
                let cls = "";
                if (idx.toString() === correctAnswerDecoded) cls = "opt-correct";
                if (idx.toString() === userAnswer) cls = isCorrect ? "opt-correct" : "opt-wrong";
                content += `<span class="review-opt ${cls}">${opt}</span>`;
            });
        }
        div.innerHTML += `<div class="review-item ${isCorrect?'correct':'wrong'}">${content}</div>`;
    });
    if(window.MathJax) { MathJax.typesetPromise([div]).catch(e=>{}); }
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }
function startHintTimer(index) { 
    if (hintTimeout) clearTimeout(hintTimeout); 
    const hint = activeQuestions[index].hint;
    if(hint && hint.trim() !== "") {
        hintTimeout = setTimeout(() => { 
            document.getElementById('agentBox').classList.remove('hidden'); 
            document.getElementById('agentText').innerText = hint; 
        }, 45000); 
    }
}
function hideAgent() { document.getElementById('agentBox').classList.add('hidden'); }
function sendToGoogleSheets(data, fbEl) { 
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", 
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(res => { 
        if(res.status === "success" && fbEl) fbEl.innerHTML += " <span style='font-size:0.8rem; color:#10b981;'>✅ Kaydedildi.</span>";
    })
    .catch(e => { if(fbEl) fbEl.innerHTML += " <span style='font-size:0.8rem; color:#ef4444;'>❌ Kayıt Hatası!</span>"; });
}

function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }

async function adminLoginAttempt() { 
    const inputPass = document.getElementById('adminPass').value;
    const msgBuffer = new TextEncoder().encode(inputPass);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if(hashHex === ADMIN_HASH) {
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminControls').classList.remove('hidden');
        Swal.fire({toast:true, position:'top-end', icon:'success', title:'Giriş Başarılı', timer:2000, showConfirmButton:false});
    } else {
        Swal.fire({icon:'error', title:'Hata', text:'Hatalı Yönetici Şifresi!'});
    }
}

function deleteQuestions() { 
    Swal.fire({title:'Emin misiniz?', text:"Tüm sorular silinecek!", icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444', confirmButtonText:'Evet, Sil'})
    .then((result) => {
        if(result.isConfirmed) {
             updateAdminStatus("Siliniyor...");
             fetch(GOOGLE_SCRIPT_URL, {method:"POST", body:JSON.stringify({type:"DELETE_ALL"})})
             .then(r=>r.json()).then(()=>{ updateAdminStatus("Tümü Silindi ✅", "green"); });
        }
    });
}

function uploadQuestions() { 
    try {
        const jsonData = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(jsonData)) throw new Error("Veri bir dizi [...] olmalı.");
        updateAdminStatus("Yükleniyor...");
        fetch(GOOGLE_SCRIPT_URL, {method:"POST", body:JSON.stringify({type:"ADD_BULK", questions:jsonData})})
        .then(r=>r.json())
        .then(res => { 
            if(res.status==='success') updateAdminStatus(`${jsonData.length} soru yüklendi ✅`, "green"); 
            else updateAdminStatus("Hata: "+res.message, "red");
        });
    } catch(e){
        Swal.fire({icon:'error', title:'JSON Hatası', text:e.message});
    } 
}

function updateAdminStatus(msg, color="gray") {
    const el = document.getElementById('adminStatus');
    el.innerText = msg; el.style.color = color;
}