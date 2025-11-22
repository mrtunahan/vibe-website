// ------------------------------------------------------------------
// ⚠️ GÜNCEL GOOGLE APPS SCRIPT LİNKİNİ BURAYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzaz1wDb__wA5OzSQd6O6KizWE4yIHapOYyhdGe9Nk9lc7OsZl4IeOBBTslN8auMJ9t/exec'; 

// --- DEĞİŞKENLER ---
let questionsSource = []; 
let activeQuestions = [];
let studentName = "", studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60; // 30 Dakika
let examTimerInterval, hintTimeout; 
let isExamActive = false;

// --- BAŞLANGIÇ ---
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    
    fetch(GOOGLE_SCRIPT_URL)
        .then(response => response.json())
        .then(data => {
            if(data.error) { 
                startBtn.innerText = "Veritabanı Hatası!"; 
                console.error(data.error);
                return; 
            }
            questionsSource = data;
            if(questionsSource.length === 0) {
                startBtn.innerText = "Soru Bekleniyor (Admin)...";
            } else {
                startBtn.innerText = "Sınavı Başlat";
                startBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Hata:', error);
            startBtn.innerText = "Bağlantı Yok! Sayfayı Yenile.";
        });
});

// --- SINAV BAŞLATMA ---
function startQuiz() {
    const name = document.getElementById('studentName').value.trim();
    const id = document.getElementById('studentId').value.toString();

    if (name === "" || id.length !== 9) { alert("İsim ve 9 haneli numara zorunludur!"); return; }

    // 1. Tam Ekran
    openFullscreen();
    
    // 2. Değişkenleri Ata
    studentName = name; 
    studentNumber = id; 
    isExamActive = true; // 🔥 Kilit nokta burası!

    // 3. Soruları Karıştır (İlk 20 soruyu alabiliriz istersek)
    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    
    activeQuestions = shuffled.map(q => ({
        ...q, 
        _secureAnswer: q.answer,
        topic: q.topic || "Genel",
        image: q.image || ""
    }));

    // 4. Ekranları Değiştir
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    // 5. Hazırlık
    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    
    // 6. Sayacı Başlat (Emin olmak için önce temizle)
    if(examTimerInterval) clearInterval(examTimerInterval);
    startExamTimer();

    // 7. Kopya Korumasını Aktif Et
    activateAntiCheat();
}

// --- SORU GÖSTERİMİ ---
function showQuestion(index) {
    hideAgent();
    
    // Progress Bar
    const progress = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;

    const q = activeQuestions[index];
    document.getElementById('qIndex').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    // Görsel Kontrolü
    const imgContainer = document.getElementById('imgContainer');
    const imgEl = document.getElementById('qImage');
    if (q.image && q.image.trim() !== "") {
        imgEl.src = q.image;
        imgContainer.classList.remove('hidden');
    } else {
        imgContainer.classList.add('hidden');
    }

    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 
    q.options.forEach((opt, i) => {
        const chk = userAnswers[index] === i ? "checked" : "";
        div.innerHTML += `
            <label onclick="selectOption(${index}, ${i})">
                <input type="radio" name="opt" ${chk}> 
                <span>${opt}</span>
            </label>`;
    });

    const btn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        btn.innerText = "Sınavı Bitir ✅";
        btn.onclick = () => finishQuiz('NORMAL');
    } else {
        btn.innerText = "Sonraki Soru ➡️";
        btn.onclick = nextQuestion;
    }

    startHintTimer(index);
}

function selectOption(i, opt) { userAnswers[i] = opt; }
function nextQuestion() { currentQuestionIndex++; showQuestion(currentQuestionIndex); }

// --- İTİRAZ ---
function reportObjection() {
    const q = activeQuestions[currentQuestionIndex];
    const reason = prompt("İtiraz sebebiniz nedir?");
    if (reason && reason.trim() !== "") {
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", mode: "no-cors",
            body: JSON.stringify({
                type: "OBJECTION",
                Isim: studentName,
                Soru: `Soru ${currentQuestionIndex + 1}: ${q.question}`,
                Sebep: reason
            })
        }).then(() => alert("İtiraz kaydedildi."));
    }
}

// --- SAYAÇ & KOPYA KORUMASI (Düzeltilmiş) ---
function startExamTimer() {
    totalTimeLeft = 30 * 60; // Süreyi resetle
    const timerDisplay = document.getElementById('timer');
    const timerBox = document.getElementById('timerBox');

    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) {
            finishQuiz("TIMEOUT");
        } else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft / 60);
            let s = totalTimeLeft % 60;
            timerDisplay.innerText = `${m}:${s < 10 ? '0'+s : s}`;
            
            if(totalTimeLeft < 60) {
                timerBox.style.backgroundColor = "#fee2e2";
                timerBox.style.color = "#ef4444";
            }
        }
    }, 1000);
}

function activateAntiCheat() {
    // 1. Görünürlük Değişimi (Sekme değiştirme)
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && isExamActive) {
            finishQuiz("CHEATING");
        }
    });

    // 2. Odak Kaybı (Pencere dışına tıklama) - İsteğe bağlı, çok katı olabilir
    // window.onblur = () => { if(isExamActive) finishQuiz("CHEATING"); };
}

// --- SINAV BİTİRME ---
function finishQuiz(type) {
    if (!isExamActive) return; // Zaten bittiyse tekrar çalışma
    isExamActive = false; 
    
    clearInterval(examTimerInterval); 
    clearTimeout(hintTimeout);

    let score = 0;
    let topicStats = {};

    activeQuestions.forEach((q, i) => {
        if(!topicStats[q.topic]) topicStats[q.topic] = {total:0, correct:0};
        topicStats[q.topic].total++;
        
        if (type !== "CHEATING" && userAnswers[i] === q._secureAnswer) {
            score += (100 / activeQuestions.length);
            topicStats[q.topic].correct++;
        }
    });
    score = Math.round(score);

    // Ekran Geçişi
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "Normal";
    let weakTopic = "";

    if (type === "CHEATING") {
        fb.innerText = "⚠️ KOPYA GİRİŞİMİ! Sınavınız iptal edildi.";
        fb.style.color = "var(--danger)";
        statusNote = "KOPYA";
        document.querySelector('.score-circle').style.background = "var(--danger)";
    } else if (type === "TIMEOUT") {
        fb.innerText = "⏰ Süre Doldu. Mevcut cevaplar kaydedildi.";
        fb.style.color = "var(--warning)";
        statusNote = "SURE_BITTI";
        generateReport(topicStats);
    } else if (score >= 50) {
        fb.innerText = "Tebrikler! Dersi başarıyla geçtiniz. 🎉";
        fb.style.color = "var(--success)";
        document.querySelector('.score-circle').style.background = "var(--success)";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
        generateReport(topicStats);
    } else {
        fb.innerText = "Maalesef kaldınız.";
        fb.style.color = "var(--secondary)";
        document.querySelector('.score-circle').style.background = "var(--secondary)";
        generateReport(topicStats);
    }

    // Rapor Fonksiyonu
    function generateReport(stats) {
        weakTopic = generateAnalysis(stats);
        generateReviewPanel();
    }

    // Veriyi Gönder
    sendToGoogleSheets({
        type:"RESULT", Isim:studentName, Numara:studentNumber, 
        Puan:score, Durum:statusNote, Zayif_Konu: weakTopic 
    }, fb);
}

function generateAnalysis(stats) {
    let weak = [], strong = [], worstRatio = 100, worstTopic = "-";
    for(let topic in stats) {
        let ratio = (stats[topic].correct / stats[topic].total) * 100;
        if(ratio < worstRatio) { worstRatio = ratio; worstTopic = topic; }
        if(ratio < 50) weak.push(topic);
        else if(ratio === 100) strong.push(topic);
    }
    
    let msg = "";
    if(strong.length > 0) msg += `🌟 <strong>Güçlü Yönler:</strong> ${strong.join(", ")}<br>`;
    if(weak.length > 0) msg += `⚠️ <strong>Geliştirilmeli:</strong> ${weak.join(", ")}`;
    
    document.getElementById('analysisBox').classList.remove('hidden');
    document.getElementById('analysisText').innerHTML = msg || "Genel performans orta seviye.";
    return worstTopic;
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        let userAns = userAnswers[i];
        let correctAns = q._secureAnswer;
        let isCorrect = (userAns === correctAns);
        let cls = isCorrect ? "correct" : "wrong";
        
        let optsHtml = "";
        q.options.forEach((opt, idx) => {
            let c = "";
            if(idx === correctAns) c = "opt-correct";
            else if(idx === userAns && !isCorrect) c = "opt-wrong";
            optsHtml += `<span class="opt-item ${c}">${opt}</span>`;
        });

        div.innerHTML += `
            <div class="review-item ${cls}">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#666; margin-bottom:5px;">
                    <span>Soru ${i+1}</span>
                    <span>${q.topic}</span>
                </div>
                <div style="font-weight:600; margin-bottom:8px;">${q.question}</div>
                ${optsHtml}
            </div>`;
    });
}

function toggleReview() { 
    const el = document.getElementById('reviewArea');
    el.classList.toggle('hidden'); 
}

// --- YARDIMCI FONKSİYONLAR ---
function startHintTimer(index) { 
    if (hintTimeout) clearTimeout(hintTimeout); 
    hintTimeout = setTimeout(() => { 
        document.getElementById('agentBox').classList.remove('hidden'); 
        document.getElementById('agentText').innerText = activeQuestions[index].hint; 
    }, 30000); 
}

function hideAgent() { document.getElementById('agentBox').classList.add('hidden'); }

function openFullscreen() { 
    const e = document.documentElement; 
    if(e.requestFullscreen) e.requestFullscreen().catch(()=>{}); 
}

function sendToGoogleSheets(data, fb) {
    fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify(data)})
    .then(()=>{ 
        // fb.innerText += " (Kaydedildi)"; // İsteğe bağlı, arayüzü bozmasın diye kapattım
    });
}

// --- ADMİN ---
function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }
function adminLogin() { if(document.getElementById('adminPass').value==="1234") document.getElementById('adminControls').classList.remove('hidden'); }
function deleteQuestions() { if(confirm("Silinsin mi?")) fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"DELETE_ALL"})}).then(()=>alert("Silindi")); }
function uploadQuestions() { try { fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"ADD_BULK", questions:JSON.parse(document.getElementById('jsonInput').value)})}).then(()=>alert("Yüklendi!")); } catch(e){alert("JSON Hatası");} }