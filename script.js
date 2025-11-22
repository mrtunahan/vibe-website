// ⚠️ YENİ LİNKİ BURAYA YAPIŞTIR
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzaz1wDb__wA5OzSQd6O6KizWE4yIHapOYyhdGe9Nk9lc7OsZl4IeOBBTslN8auMJ9t/exec'; 

let questionsSource = []; 
let activeQuestions = [];
let studentName = "", studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60;
let examTimerInterval, hintTimeout; 
let isExamActive = false;

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    fetch(GOOGLE_SCRIPT_URL).then(r => r.json()).then(data => {
        if(data.error) { startBtn.innerText = "Hata!"; return; }
        questionsSource = data;
        if(questionsSource.length === 0) startBtn.innerText = "Soru Yok (Admin)...";
        else { startBtn.innerText = "Sınavı Başlat"; startBtn.disabled = false; }
    }).catch(e => startBtn.innerText = "Bağlantı Hatası!");
});

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
        topic: q.topic || "Genel",
        image: q.image || "" // Resim linkini al
    }));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

function showQuestion(index) {
    hideAgent();
    
    // İLERLEME ÇUBUĞU GÜNCELLEME
    const progress = ((index) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;

    const q = activeQuestions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    // GÖRSEL KONTROLÜ
    const imgEl = document.getElementById('qImage');
    if (q.image && q.image.trim() !== "") {
        imgEl.src = q.image;
        imgEl.classList.remove('hidden');
    } else {
        imgEl.classList.add('hidden');
    }

    const div = document.getElementById('qOptions');
    div.innerHTML = ""; 
    q.options.forEach((opt, i) => {
        const chk = userAnswers[index] === i ? "checked" : "";
        div.innerHTML += `<label onclick="selectOption(${index}, ${i})"><input type="radio" name="opt" ${chk}> ${opt}</label>`;
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

// --- YENİ: İTİRAZ SİSTEMİ ---
function reportObjection() {
    const q = activeQuestions[currentQuestionIndex];
    const reason = prompt("Bu soruya itiraz sebebiniz nedir?");
    if (reason && reason.trim() !== "") {
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", mode: "no-cors",
            body: JSON.stringify({
                type: "OBJECTION",
                Isim: studentName,
                Soru: `Soru ${currentQuestionIndex + 1}: ${q.question}`,
                Sebep: reason
            })
        }).then(() => alert("İtirazınız hocaya iletildi."));
    }
}

function finishQuiz(type) {
    isExamActive = false; clearInterval(examTimerInterval); clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.getElementById('progressBar').style.width = "100%";

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

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "Normal";
    let weakTopic = ""; // En zayıf konu

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
        weakTopic = generateAnalysis(topicStats); 
        generateReviewPanel();
    }

    sendToGoogleSheets({
        type:"RESULT", 
        Isim:studentName, 
        Numara:studentNumber, 
        Puan:score, 
        Durum:statusNote,
        Zayif_Konu: weakTopic // Hocanın Excel'ine gidecek
    }, feedback);
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
    if(strong.length > 0) msg += `🌟 <strong>Güçlü:</strong> ${strong.join(", ")}<br>`;
    if(weak.length > 0) msg += `⚠️ <strong>Geliştir:</strong> ${weak.join(", ")}`;
    document.getElementById('analysisBox').classList.remove('hidden');
    document.getElementById('analysisText').innerHTML = msg || "Genel tekrar yap.";
    return worstTopic; // En zayıf konuyu döndür
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "<h3>🔍 İnceleme</h3>";
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
            optsHtml += `<span class="review-opt ${c}">${opt}</span>`;
        });

        div.innerHTML += `<div class="review-item ${cls}"><span class="opt-topic">${q.topic}</span><div style="font-weight:bold;">${i+1}. ${q.question}</div>${q.image?`<img src="${q.image}" style="max-width:100px; display:block; margin:5px 0;">`:""}${optsHtml}</div>`;
    });
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }
function startHintTimer(index) { if (hintTimeout) clearTimeout(hintTimeout); hintTimeout = setTimeout(() => { document.getElementById('agentBox').classList.remove('hidden'); document.getElementById('agentText').innerText = activeQuestions[index].hint; }, 30000); }
function hideAgent() { document.getElementById('agentBox').classList.add('hidden'); }
function handleVisibilityChange() { if(document.hidden && isExamActive) finishQuiz("CHEATING"); }
function openFullscreen() { const e = document.documentElement; if(e.requestFullscreen) e.requestFullscreen().catch(()=>{}); }
function sendToGoogleSheets(data, fb) { fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify(data)}).then(()=>{ fb.innerText += " ✅ Kaydedildi"; }); }

function toggleAdmin() { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('adminPanel').classList.remove('hidden'); }
function closeAdmin() { document.getElementById('adminPanel').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); }
function adminLogin() { if(document.getElementById('adminPass').value==="1234") document.getElementById('adminControls').classList.remove('hidden'); }
function deleteQuestions() { if(confirm("Silinsin mi?")) fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"DELETE_ALL"})}).then(()=>alert("Silindi")); }
function uploadQuestions() { try { fetch(GOOGLE_SCRIPT_URL, {method:"POST", mode:"no-cors", body:JSON.stringify({type:"ADD_BULK", questions:JSON.parse(document.getElementById('jsonInput').value)})}).then(()=>alert("Yüklendi!")); } catch(e){alert("JSON Hatası");} }