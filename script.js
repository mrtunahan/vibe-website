// ------------------------------------------------------------------
// ⚠️ YENİ GOOGLE SCRIPT LINKINI BURAYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxlUQQ-AS8fh4WJ3zmmCGpyYmfJm9byMA-4NjTrQf9n8j4DX9HZAk36YPKiT9WR3bC3/exec'; 

// --- DEĞİŞKENLER ---
let questionsSource = []; 
let activeQuestions = [];
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60;
let examTimerInterval;
let hintTimeout; 
let isExamActive = false;

// --- SAYFA YÜKLENİNCE SORULARI ÇEK ---
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    fetch(GOOGLE_SCRIPT_URL)
        .then(response => response.json())
        .then(data => {
            if(data.error) { startBtn.innerText = "Hata!"; return; }
            questionsSource = data;
            if(questionsSource.length === 0) startBtn.innerText = "Soru Yok (Admin)...";
            else { startBtn.innerText = "Sınavı Başlat"; startBtn.disabled = false; }
        })
        .catch(e => startBtn.innerText = "Bağlantı Hatası!");
});

// --- SINAVI BAŞLAT ---
function startQuiz() {
    const name = document.getElementById('studentName').value.trim();
    const id = document.getElementById('studentId').value.toString();

    if (name === "" || id.length !== 9) { alert("Bilgileri kontrol edin!"); return; }

    openFullscreen();
    studentName = name; studentNumber = id; isExamActive = true; 

    // Soruları karıştır
    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    activeQuestions = shuffled.map(q => ({
        ...q, 
        _secureAnswer: q.answer,
        topic: q.topic || "Genel" // Konu yoksa Genel ata
    }));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- SORU GÖSTER ---
function showQuestion(index) {
    hideAgent();
    const q = activeQuestions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 

    q.options.forEach((opt, i) => {
        const isChecked = userAnswers[index] === i ? "checked" : "";
        div.innerHTML += `<label onclick="selectOption(${index}, ${i})"><input type="radio" name="opt" ${isChecked}> ${opt}</label>`;
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

// --- SINAVI BİTİR VE ANALİZ ET ---
function finishQuiz(type) {
    isExamActive = false; clearInterval(examTimerInterval); clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0;
    let topicStats = {}; // Konu analizi için: {"Donanım": {total:2, correct:1}}

    activeQuestions.forEach((q, i) => {
        // Konu istatistiğini hazırla
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

    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "Normal";

    if (type === "CHEATING") {
        feedback.innerText = "⚠️ KOPYA GİRİŞİMİ! İPTAL."; feedback.style.color = "red"; statusNote = "KOPYA";
    } else if (score >= 50) {
        feedback.innerText = "Tebrikler! Geçtiniz. 🎉"; feedback.style.color = "green";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
    } else {
        feedback.innerText = "Kaldınız."; feedback.style.color = "orange";
    }

    if (type !== "CHEATING") {
        generateAnalysis(topicStats); // Analizi oluştur
        generateReviewPanel(); // İnceleme listesini oluştur
    }

    sendToGoogleSheets({type:"RESULT", Isim:studentName, Numara:studentNumber, Puan:score, Durum:statusNote}, feedback);
}

// --- ANALİZ MOTORU ---
function generateAnalysis(stats) {
    let weak = [], strong = [];
    for(let topic in stats) {
        let ratio = (stats[topic].correct / stats[topic].total) * 100;
        if(ratio < 50) weak.push(topic);
        else if(ratio === 100) strong.push(topic);
    }
    
    let msg = "";
    if(strong.length > 0) msg += `🌟 <strong>Güçlü Yönlerin:</strong> ${strong.join(", ")}<br>`;
    if(weak.length > 0) msg += `⚠️ <strong>Geliştirmen Gerekenler:</strong> ${weak.join(", ")}`;
    if(msg === "") msg = "Genel olarak orta seviyedesin, tekrara devam.";
    
    document.getElementById('analysisBox').classList.remove('hidden');
    document.getElementById('analysisText').innerHTML = msg;
}

// --- İNCELEME PANELİ ---
function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "<h3>🔍 Detaylı İnceleme</h3>";
    
    activeQuestions.forEach((q, i) => {
        let userAns = userAnswers[i];
        let correctAns = q._secureAnswer;
        let isCorrect = (userAns === correctAns);
        let statusClass = isCorrect ? "correct" : "wrong";
        
        let optsHtml = "";
        q.options.forEach((opt, idx) => {
            let cls = "";
            if(idx === correctAns) cls = "opt-correct";
            else if(idx === userAns && !isCorrect) cls = "opt-wrong";
            optsHtml += `<span class="review-opt ${cls}">${opt}</span>`;
        });

        div.innerHTML += `
            <div class="review-item ${statusClass}">
                <span class="opt-topic">${q.topic}</span>
                <div style="font-weight:bold; margin-bottom:5px;">${i+1}. ${q.question}</div>
                ${optsHtml}
            </div>
        `;
    });
}

function toggleReview() {
    document.getElementById('reviewArea').classList.toggle('hidden');
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
function handleVisibilityChange() { if(document.hidden && isExamActive) finishQuiz("CHEATING"); }
function openFullscreen() { 
    const e = document.documentElement; 
    if(e.requestFullscreen) e.requestFullscreen().catch(()=>{}); 
}
function sendToGoogleSheets(data, fb) {
    fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify(data)})
    .then(()=>{ fb.innerText += " ✅ Kaydedildi"; });
}

// --- ADMİN FONKSİYONLARI ---
function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }
function adminLogin() { if(document.getElementById('adminPass').value==="1234") document.getElementById('adminControls').classList.remove('hidden'); }
function deleteQuestions() { 
    if(confirm("Silinsin mi?")) fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"DELETE_ALL"})}).then(()=>alert("Silindi"));
}
function uploadQuestions() {
    try {
        fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"ADD_BULK", questions:JSON.parse(document.getElementById('jsonInput').value)})})
        .then(()=>alert("Yüklendi!"));
    } catch(e){alert("JSON Hatası");}
}