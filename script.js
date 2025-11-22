// ⚠️ YENİ DAĞITIMDAN ALDIĞIN LİNKİ BURAYA YAPIŞTIR
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwyrboNyyOlwIkqVq45BPX3VAibVGu2WGg7cpsa-t9R1p9fDyQqnASVovCxJ-EYlgDv/exec'; 

let questionsSource = []; 
let activeQuestions = [];
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let userObjections = []; // İtirazları tutan dizi
let totalTimeLeft = 30 * 60;
let examTimerInterval;
let hintTimeout; 
let isExamActive = false;

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    fetch(GOOGLE_SCRIPT_URL).then(r => r.json()).then(data => {
        if(data.error) { startBtn.innerText = "Hata!"; return; }
        questionsSource = data;
        if(questionsSource.length === 0) startBtn.innerText = "Soru Bekleniyor (Admin)...";
        else { startBtn.innerText = "Sınavı Başlat"; startBtn.disabled = false; }
    }).catch(e => startBtn.innerText = "Bağlantı Hatası!");
});

function startQuiz() {
    const name = document.getElementById('studentName').value.trim();
    const id = document.getElementById('studentId').value.toString();
    if (name === "" || id.length !== 9) { alert("Bilgileri kontrol edin!"); return; }

    openFullscreen();
    studentName = name; studentNumber = id; isExamActive = true; 

    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    activeQuestions = shuffled.map(q => ({
        ...q, _secureAnswer: q.answer, topic: q.topic || "Genel"
    }));

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    userObjections = new Array(activeQuestions.length).fill(null); // İtiraz dizisini hazırla

    showQuestion(0);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

function showQuestion(index) {
    hideAgent();
    
    // 1. İlerleme Çubuğunu Güncelle
    let progress = ((index) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = progress + "%";

    const q = activeQuestions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    // 2. Resim Kontrolü
    const img = document.getElementById('qImage');
    if(q.image && q.image.length > 5) {
        img.src = q.image;
        img.classList.remove('hidden');
    } else {
        img.classList.add('hidden');
    }

    // 3. İtiraz Butonu Durumu
    const objBtn = document.getElementById('objectionBtn');
    if(userObjections[index]) {
        objBtn.classList.add('active');
        objBtn.innerText = "🚩 İtiraz Edildi (Geri Al)";
    } else {
        objBtn.classList.remove('active');
        objBtn.innerText = "🚩 Bu Soru Hatalı / İtiraz Et";
    }
    
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

// --- İTİRAZ ETME FONKSİYONU ---
function toggleObjection() {
    let currentIndex = currentQuestionIndex;
    const objBtn = document.getElementById('objectionBtn');
    
    if (userObjections[currentIndex]) {
        // İtirazı kaldır
        userObjections[currentIndex] = null;
        objBtn.classList.remove('active');
        objBtn.innerText = "🚩 Bu Soru Hatalı / İtiraz Et";
    } else {
        // İtiraz et
        let reason = prompt("Bu soruya neden itiraz ediyorsunuz? (İsteğe bağlı):", "Soru hatalı veya şıklar yanlış");
        if (reason !== null) { // İptal demediyse
            userObjections[currentIndex] = reason || "Belirtilmedi";
            objBtn.classList.add('active');
            objBtn.innerText = "🚩 İtiraz Edildi (Geri Al)";
        }
    }
}

function finishQuiz(type) {
    isExamActive = false; clearInterval(examTimerInterval); clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.getElementById('progressBar').style.width = "100%"; // Çubuğu full'le

    let score = 0;
    let topicStats = {}; 
    let objectionsList = [];

    activeQuestions.forEach((q, i) => {
        // Konu İstatistiği
        if(!topicStats[q.topic]) topicStats[q.topic] = {total:0, correct:0};
        topicStats[q.topic].total++;

        if (type !== "CHEATING" && userAnswers[i] === q._secureAnswer) {
            score += (100 / activeQuestions.length);
            topicStats[q.topic].correct++;
        }
        
        // İtirazları Topla
        if (userObjections[i]) {
            objectionsList.push(`Soru ${i+1}: ${userObjections[i]}`);
        }
    });
    score = Math.round(score);

    // En Zayıf Konuyu Bul
    let weakestTopic = "Yok";
    let minRatio = 101;
    for(let t in topicStats) {
        let ratio = (topicStats[t].correct / topicStats[t].total) * 100;
        if (ratio < minRatio) { minRatio = ratio; weakestTopic = t; }
    }

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
        feedback.innerText = "Tebrikler! Geçtiniz."; feedback.style.color = "green";
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
    } else {
        feedback.innerText = "Kaldınız."; feedback.style.color = "orange";
    }

    if (type !== "CHEATING") {
        generateAnalysis(topicStats); 
        generateReviewPanel(); 
    }

    // Verileri Hazırla ve Gönder
    const resultData = {
        type: "RESULT", 
        Isim: studentName, 
        Numara: studentNumber, 
        Puan: score, 
        Durum: statusNote,
        ZayifKonu: weakestTopic, // Excel'e gidecek yeni veri
        Itirazlar: objectionsList.join(" | ") // Excel'e gidecek itirazlar
    };

    sendToGoogleSheets(resultData, feedback);
}

// ... (generateAnalysis, generateReviewPanel, startHintTimer vb. önceki kodlarla AYNI) ...
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

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "<h3>🔍 Detaylı İnceleme</h3>";
    activeQuestions.forEach((q, i) => {
        let userAns = userAnswers[i];
        let correctAns = q._secureAnswer;
        let isCorrect = (userAns === correctAns);
        let statusClass = isCorrect ? "correct" : "wrong";
        
        // İtiraz varsa belirt
        let objectionBadge = userObjections[i] ? `<span style="color:red; font-size:0.8rem;">(🚩 İtiraz: ${userObjections[i]})</span>` : "";

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
                <div style="font-weight:bold; margin-bottom:5px;">${i+1}. ${q.question} ${objectionBadge}</div>
                ${q.image ? `<img src="${q.image}" style="max-height:100px; display:block; margin:5px 0;">` : ""}
                ${optsHtml}
            </div>
        `;
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