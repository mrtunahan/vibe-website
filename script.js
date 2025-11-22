// ------------------------------------------------------------------
// ⚠️ ÇALIŞAN GOOGLE APPS SCRIPT LINKINI BURAYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz8zA3_k3jX5uyHKt2l3sNgA2j4pPHYox5QB2QyYMwzi6mGcK551HBgW8BOBvymow9_/exec'; 

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
            if(data.error) {
                startBtn.innerText = "Sistem Hatası!";
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
            startBtn.innerText = "Bağlantı Yok! Yenile.";
        });
});

// --- 1. SINAVI BAŞLAT ---
function startQuiz() {
    const nameInput = document.getElementById('studentName').value.trim();
    const idInput = document.getElementById('studentId').value.toString();

    if (nameInput === "") { alert("İsim alanı boş bırakılamaz!"); return; }
    if (idInput.length !== 9) { alert("Öğrenci numarası 9 haneli olmalıdır!"); return; }

    // ⭐ YENİ: TAM EKRAN MODU ⭐
    openFullscreen();

    studentName = nameInput;
    studentNumber = idInput;
    isExamActive = true; 

    // Soruları Karıştır ve Cevapları Gizle
    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    
    activeQuestions = shuffled.map(q => {
        return {
            question: q.question,
            options: q.options,
            hint: q.hint,
            _secureAnswer: q.answer
        };
    });

    // Ekranları Değiştir
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- YARDIMCI: TAM EKRAN FONKSİYONU ---
function openFullscreen() {
    const elem = document.documentElement;
    try {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    } catch(err) {
        console.log("Tam ekran engellendi (Tarayıcı izni yok)");
    }
}

// --- 2. SORU GÖSTERİMİ ---
function showQuestion(index) {
    hideAgent();
    
    const q = activeQuestions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    const optionsDiv = document.getElementById('qOptions');
    optionsDiv.innerHTML = ""; 

    q.options.forEach((opt, i) => {
        const isChecked = userAnswers[index] === i ? "checked" : "";
        optionsDiv.innerHTML += `
            <label onclick="selectOption(${index}, ${i})">
                <input type="radio" name="option" ${isChecked}>
                ${opt}
            </label>
        `;
    });

    const btn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        btn.innerText = "Sınavı Bitir ✅";
        btn.setAttribute("onclick", "finishQuiz('NORMAL')");
    } else {
        btn.innerText = "Sonraki Soru ➡️";
        btn.setAttribute("onclick", "nextQuestion()");
    }

    startHintTimer(index);
}

function selectOption(qIndex, optionIndex) {
    userAnswers[qIndex] = optionIndex;
}

function nextQuestion() {
    currentQuestionIndex++;
    showQuestion(currentQuestionIndex);
}

// --- 3. AJAN VE ZAMANLAYICILAR ---
function startHintTimer(qIndex) {
    if (hintTimeout) clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => {
        showAgent(activeQuestions[qIndex].hint);
    }, 30000); 
}

function showAgent(hintText) {
    const box = document.getElementById('agentBox');
    document.getElementById('agentText').innerText = hintText;
    box.classList.remove('hidden');
}

function hideAgent() {
    document.getElementById('agentBox').classList.add('hidden');
    if (hintTimeout) clearTimeout(hintTimeout);
}

function startExamTimer() {
    const timerDisplay = document.getElementById('timer');
    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) {
            finishQuiz("TIMEOUT");
        } else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft / 60);
            let s = totalTimeLeft % 60;
            timerDisplay.innerText = `Kalan: ${m}:${s < 10 ? '0'+s : s}`;
            if(totalTimeLeft < 60) timerDisplay.style.color = "red";
        }
    }, 1000);
}

// --- 4. KOPYA KORUMASI ---
function handleVisibilityChange() {
    if (document.hidden && isExamActive) {
        finishQuiz("CHEATING");
    }
}

// --- 5. BİTİŞ, PUANLAMA VE SERTİFİKA ---
function finishQuiz(type) {
    isExamActive = false;
    clearInterval(examTimerInterval);
    clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0;
    const pointPerQuestion = 100 / activeQuestions.length;

    if (type !== "CHEATING") {
        activeQuestions.forEach((q, i) => {
            if (userAnswers[i] === q._secureAnswer) {
                score += pointPerQuestion;
            }
        });
    }
    score = Math.round(score);

    // Ekranları Yönet
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "Normal";

    // Durum Kontrolü
    if (type === "CHEATING") {
        feedback.innerText = "⚠️ KOPYA GİRİŞİMİ! Sınav iptal edildi.";
        feedback.style.color = "red";
        statusNote = "KOPYA_GIRISIMI";
    } else if (score >= 50) {
        // ⭐ GEÇME DURUMU VE SERTİFİKA ⭐
        feedback.innerText = "Tebrikler! Dersi başarıyla geçtiniz. 🎉";
        feedback.style.color = "green";
        
        // Sertifikayı Göster
        document.getElementById('certificateArea').classList.remove('hidden');
        document.getElementById('certName').innerText = studentName;
        document.getElementById('certDate').innerText = new Date().toLocaleDateString();
    } else {
        // KALMA DURUMU
        feedback.innerText = "Maalesef kaldınız. Daha çok çalışmalısınız.";
        feedback.style.color = "orange";
        if(type === "TIMEOUT") {
             feedback.innerText += " (Süre Doldu)";
             statusNote = "SURE_BITTI";
        }
    }

    // Veriyi Google'a Gönder
    const data = {
        type: "RESULT", 
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote
    };
    sendToGoogleSheets(data, feedback);
}

function sendToGoogleSheets(data, feedbackElement) {
    feedbackElement.innerText += " (Veritabanına işleniyor...)";
    
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(() => {
        let currentText = feedbackElement.innerText.replace(" (Veritabanına işleniyor...)", "");
        feedbackElement.innerText = currentText + " ✅ KAYDEDİLDİ";
    }).catch(e => {
        feedbackElement.innerText += " ⚠️ Bağlantı Hatası (Yerel Kayıt)";
    });
}

// --- 6. ADMİN PANELİ ---
function toggleAdmin() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
}

function closeAdmin() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
}

function adminLogin() {
    const pass = document.getElementById('adminPass').value;
    if (pass === "1234") { 
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminControls').classList.remove('hidden');
    } else {
        alert("Yanlış şifre!");
    }
}

function deleteQuestions() {
    if(!confirm("Emin misiniz? Tüm sorular silinecek!")) return;
    updateStatus("Siliniyor...");
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        body: JSON.stringify({ type: "DELETE_ALL" })
    }).then(() => {
        updateStatus("✅ Tüm sorular silindi!");
        alert("Veritabanı temizlendi.");
    });
}

function uploadQuestions() {
    const jsonText = document.getElementById('jsonInput').value;
    try {
        const questionsData = JSON.parse(jsonText);
        updateStatus("Yükleniyor...");
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", mode: "no-cors",
            body: JSON.stringify({ type: "ADD_BULK", questions: questionsData })
        }).then(() => {
            updateStatus("✅ Yüklendi! Sayfayı yenileyip test et.");
            document.getElementById('jsonInput').value = "";
            alert("Sorular başarıyla yüklendi!");
        });
    } catch (e) {
        alert("Geçersiz JSON formatı!");
    }
}

function updateStatus(msg) {
    document.getElementById('adminStatus').innerText = msg;
}