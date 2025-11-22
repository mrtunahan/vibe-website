// ------------------------------------------------------------------
// ⚠️ YENİ KOPYALADIĞIN GOOGLE APPS SCRIPT LINKINI BURAYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwSaooMwR9YWESL9A45b2GIGuXIGTON4BPtpHexdW8OUSkpTreci5Vkn-bRuPIm4X8Q/exec'; 

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
    fetch(GOOGLE_SCRIPT_URL).then(r => r.json()).then(data => {
        if(data.error) { startBtn.innerText = "Veritabanı Hatası!"; return; }
        questionsSource = data;
        if(questionsSource.length === 0) startBtn.innerText = "Soru Yok (Admin)...";
        else { startBtn.innerText = "Sınavı Başlat"; startBtn.disabled = false; }
    }).catch(e => startBtn.innerText = "Bağlantı Hatası!");
});

// --- SINAV BAŞLAT ---
function startQuiz() {
    const name = document.getElementById('studentName').value.trim();
    const id = document.getElementById('studentId').value.toString();

    if (name === "" || id.length !== 9) { alert("İsim ve 9 haneli numara zorunludur!"); return; }

    openFullscreen();
    studentName = name; studentNumber = id; isExamActive = true; 

    // Soruları Karıştır
    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    activeQuestions = shuffled.map(q => ({
        ...q, _secureAnswer: q.answer, topic: q.topic || "Genel", image: q.image || ""
    }));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    
    // SAYAÇ BAŞLAT (Hata Düzeltildi)
    if(examTimerInterval) clearInterval(examTimerInterval);
    startExamTimer();

    // KOPYA KORUMASI AKTİF (Hata Düzeltildi)
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

function showQuestion(index) {
    hideAgent();
    
    // Progress Bar
    const progress = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;

    const q = activeQuestions[index];
    document.getElementById('qIndex').innerText = `SORU ${index + 1}`;
    document.getElementById('qText').innerText = q.question;
    
    // Görsel Kontrolü
    const imgEl = document.getElementById('qImage');
    if (q.image && q.image.trim() !== "") { imgEl.src = q.image; imgEl.classList.remove('hidden'); }
    else { imgEl.classList.add('hidden'); }

    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 
    q.options.forEach((opt, i) => {
        const chk = userAnswers[index] === i ? "checked" : "";
        div.innerHTML += `<label onclick="selectOption(${index}, ${i})"><input type="radio" name="opt" ${chk}> <span>${opt}</span></label>`;
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
    const reason = prompt("İtiraz sebebiniz?");
    if (reason) fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"OBJECTION", Isim:studentName, Soru:q.question, Sebep:reason})}).then(()=>alert("İletildi."));
}

// --- SAYAÇ ---
function startExamTimer() {
    totalTimeLeft = 30 * 60; 
    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) finishQuiz("TIMEOUT");
        else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft/60), s = totalTimeLeft%60;
            document.getElementById('timer').innerText = `${m}:${s<10?'0'+s:s}`;
        }
    }, 1000);
}

// --- KOPYA KORUMASI ---
function handleVisibilityChange() {
    if(document.hidden && isExamActive) finishQuiz("CHEATING");
}

// --- BİTİŞ ---
function finishQuiz(type) {
    if(!isExamActive) return;
    isExamActive = false; 
    clearInterval(examTimerInterval); 
    clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0, topicStats = {};
    activeQuestions.forEach((q, i) => {
        if(!topicStats[q.topic]) topicStats[q.topic] = {total:0, correct:0};
        topicStats[q.topic].total++;
        if (type !== "CHEATING" && userAnswers[i] === q._secureAnswer) {
            score += (100 / activeQuestions.length);
            topicStats[q.topic].correct++;
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

    if (type === "CHEATING") {
        fb.innerText = "⚠️ KOPYA GİRİŞİMİ! Sınav İptal."; fb.style.color = "#ef4444"; statusNote = "KOPYA";
    } else if (type === "TIMEOUT") {
        fb.innerText = "⏰ Süre Doldu."; fb.style.color = "#f59e0b"; statusNote = "SURE_BITTI"; generateReport(topicStats);
    } else if (score >= 50) {
        fb.innerText = "Tebrikler! Geçtiniz. 🎉"; fb.style.color = "#10b981";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
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
        let ratio = (stats[topic].correct/stats[topic].total)*100;
        if(ratio<worstRatio) { worstRatio=ratio; worstTopic=topic; }
        if(ratio<50) weak.push(topic); else if(ratio===100) strong.push(topic);
    }
    let msg = "";
    if(strong.length>0) msg += `🌟 <strong>Güçlü:</strong> ${strong.join(", ")}<br>`;
    if(weak.length>0) msg += `⚠️ <strong>Geliştir:</strong> ${weak.join(", ")}`;
    document.getElementById('analysisBox').classList.remove('hidden');
    document.getElementById('analysisText').innerHTML = msg || "Genel performans orta.";
    return worstTopic;
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        let u = userAnswers[i], c = q._secureAnswer, ok = (u===c);
        let opts = "";
        q.options.forEach((opt, idx) => {
            let cls = (idx===c) ? "opt-correct" : (idx===u && !ok ? "opt-wrong" : "");
            opts += `<span class="review-opt ${cls}" style="display:block; padding:5px; margin:2px 0; border-radius:4px; font-size:0.9rem;">${opt}</span>`;
        });
        div.innerHTML += `<div class="review-item ${ok?'correct':'wrong'}"><div style="font-weight:bold; margin-bottom:5px;">${i+1}. ${q.question}</div>${opts}</div>`;
    });
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }
function startHintTimer(index) { if (hintTimeout) clearTimeout(hintTimeout); hintTimeout = setTimeout(() => { document.getElementById('agentBox').classList.remove('hidden'); document.getElementById('agentText').innerText = activeQuestions[index].hint; }, 30000); }
function hideAgent() { document.getElementById('agentBox').classList.add('hidden'); }
function openFullscreen() { const e = document.documentElement; if(e.requestFullscreen) e.requestFullscreen().catch(()=>{}); }
function sendToGoogleSheets(data, fb) { fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify(data)}).then(()=>{ fb.innerText += " ✅ Kaydedildi"; }); }

function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }
function adminLogin() { if(document.getElementById('adminPass').value==="1234") document.getElementById('adminControls').classList.remove('hidden'); }
function deleteQuestions() { if(confirm("Sil?")) fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"DELETE_ALL"})}).then(()=>alert("Silindi")); }
function uploadQuestions() { try{ fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"ADD_BULK", questions:JSON.parse(document.getElementById('jsonInput').value)})}).then(()=>alert("Yüklendi")); }catch(e){alert("JSON Hata");} }