// ------------------------------------------------------------------
// ⚠️ YENİ DAĞITIMDAN ALDIĞIN LİNKİ BURAYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw9VXMAIxz3Aps5oOxEX75n7g0PT3nKskt2nPH0xyxy3NndNgxS5ZVOaYS_dMp-kVwV/exec'; 

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
let objectionLog = [];

// --- SAYFA YÜKLENİNCE SORULARI ÇEK ---
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    
    fetch(GOOGLE_SCRIPT_URL)
        .then(response => response.json())
        .then(data => {
            if(data.error) {
                console.error("Hata:", data.error);
                startBtn.innerText = "Veritabanı Hatası!";
                return;
            }
            // Gelen soruları kaydet
            questionsSource = data;
            
            if(questionsSource.length === 0) {
                startBtn.innerText = "Soru Bulunamadı! (Admin Panelinden Yükleyiniz)";
            } else {
                console.log("Sorular yüklendi:", questionsSource.length, "adet");
                startBtn.innerText = "Sınavı Başlat";
                startBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Bağlantı Hatası:', error);
            startBtn.innerText = "Bağlantı Hatası! Sayfayı Yenile.";
        });
});

// --- 1. SINAVI BAŞLAT ---
function startQuiz() {
    const nameInput = document.getElementById('studentName').value.trim();
    const idInput = document.getElementById('studentId').value.toString();

    if (nameInput === "") { alert("İsim alanı boş bırakılamaz!"); return; }
    if (idInput.length !== 9) { alert("Öğrenci numarası 9 haneli olmalıdır!"); return; }

    studentName = nameInput;
    studentNumber = idInput;
    isExamActive = true; 

    // A) SORULARI KARIŞTIR VE GÜVENLİ HALE GETİR
    let shuffled = [...questionsSource].sort(() => Math.random() - 0.5);
    
    activeQuestions = shuffled.map(q => {
        return {
            question: q.question,
            options: q.options,
            hint: q.hint,
            _secureAnswer: q.answer // Cevabı gizle
        };
    });

    // EKRANLARI DEĞİŞTİR
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = "Öğrenci: " + studentName;

    userAnswers = new Array(activeQuestions.length).fill(null);
    showQuestion(0);
    startExamTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- 2. SORU GÖSTERİMİ ---
function showQuestion(index) {
    hideAgent();
    
    const q = activeQuestions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerText = q.question;
    // --- İLERLEME ÇUBUĞU KODU ---
    const progressPercent = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progressPercent}%`;
    
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
    const reportButtonHtml = `
    <button class="report-btn" onclick="reportQuestion(${index})">
        ⚠️ Hatalı Soru Bildir
    </button>
    <div style="clear:both"></div> 
`   ;
    // Butonu seçeneklerin altına ekliyoruz
    optionsDiv.innerHTML += reportButtonHtml;
    // --- YENİ KOD BİTİŞ ---

    const btn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        btn.innerText = "Sınavı Tamamla ✅";
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

// --- 3. AJAN VE SAYAÇLAR ---
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

// --- 5. BİTİŞ VE KAYIT ---
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

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;
    // --- KARNE OLUŞTURMA ---
    const mistakeListDiv = document.getElementById('mistakeList');
    mistakeListDiv.innerHTML = ""; // Temizle

    activeQuestions.forEach((q, i) => {
        // Eğer cevap yanlışsa veya boşsa
        if (userAnswers[i] !== q._secureAnswer) {
            let userAnsText = userAnswers[i] !== null ? q.options[userAnswers[i]] : "Boş Bırakıldı";
            let correctAnsText = q.options[q._secureAnswer];
            
            // Ekrana bas
            mistakeListDiv.innerHTML += `
                <div class="mistake-item">
                    <strong>Soru ${i+1}:</strong> ${q.question}<br>
                    <span style="text-decoration: line-through; color:red;">Senin Cevabın: ${userAnsText}</span><br>
                    <span class="correct-answer-text">Doğru Cevap: ${correctAnsText}</span>
                </div>
            `;
        }
    });

    // Karne kutusunu aç
    document.getElementById('detailedReport').classList.remove('hidden');

    // --- AKILLI TAVSİYE (Fonksiyonu aşağıda tanımlamış olmalısın) ---
    generateAdvice(score);
    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "Normal";

    if (type === "CHEATING") {
        feedback.innerText = "⚠️ KOPYA GİRİŞİMİ! Puanınız 0.";
        feedback.style.color = "red";
        statusNote = "KOPYA_GIRISIMI";
    } else if (type === "TIMEOUT") {
        feedback.innerText = "⏰ Süre doldu.";
        statusNote = "SURE_BITTI";
    } else {
        feedback.innerText = "Sonuç veritabanına işleniyor... 🔄";
        feedback.style.color = "#2c3e50";
    }

    // VERİ PAKETİ
    let objectionText = "";
if (objectionLog.length > 0) {
    objectionText = " | İTİRAZLAR: " + objectionLog.map(o => `[S${o.soruNo}: ${o.aciklama}]`).join(", ");
}

// VERİ PAKETİ GÜNCELLEMESİ
const data = {
    type: "RESULT", 
    Isim: studentName,
    Numara: studentNumber,
    Puan: score,
    // Eğer itiraz varsa durum mesajının yanına ekle
    Durum: statusNote + objectionText 
};

    sendToGoogleSheets(data, feedback);
}

// --- GOOGLE FETCHER (Ortak Fonksiyon) ---
function sendToGoogleSheets(data, feedbackElement) {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(() => {
        if(feedbackElement) {
            feedbackElement.innerText += " ✅ KAYDEDİLDİ";
            if(data.Durum !== "KOPYA_GIRISIMI") feedbackElement.style.color = "green";
        }
    }).catch(e => {
        if(feedbackElement) feedbackElement.innerText += " ⚠️ Hata (Yerel)";
    });
}

// --- 6. ADMİN PANELİ İŞLEMLERİ ---
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
    if (pass === "1234") { // Şifreyi buradan değiştirebilirsin
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
        method: "POST",
        mode: "no-cors",
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
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ type: "ADD_BULK", questions: questionsData })
        }).then(() => {
            updateStatus("✅ Yüklendi! Sayfayı yenileyip test et.");
            document.getElementById('jsonInput').value = "";
            alert("Sorular başarıyla yüklendi!");
        });

    } catch (e) {
        alert("Geçersiz JSON formatı! Kodu kontrol et.");
    }
}

function updateStatus(msg) {
    document.getElementById('adminStatus').innerText = msg;
}
function reportQuestion(index) {
    // O anki sorunun metnini alalım (raporlarken hangi soru olduğunu bilmek için)
    const questionText = activeQuestions[index].question.substring(0, 20) + "...";
    
    // Kullanıcıdan sebep iste
    const reason = prompt("Bu soruda ne gibi bir hata var? (Lütfen kısaca açıklayınız):");
    
    if (reason && reason.trim() !== "") {
        // İtirazı kaydet
        objectionLog.push({
            soruNo: index + 1,
            soruOzet: questionText,
            aciklama: reason
        });
        
        alert("Bildiriminiz kaydedildi, teşekkürler! Sınava devam edebilirsiniz.");
    }
}
function generateAdvice(score) {
    const adviceBox = document.getElementById('aiAdvice');
    let message = "";

    if (score === 100) {
        message = "🏆 Mükemmel! Konuya tamamen hakimsin. Artık bir sonraki seviyeye geçebilirsin.";
    } else if (score >= 80) {
        message = "🌟 Çok iyisin! Ufak tefek dikkatsizlikler olmuş olabilir. Yanlış yaptığın soruların üzerinden geçersen tamamsın.";
    } else if (score >= 50) {
        message = "📈 Fena değil ama tekrar yapman gerekiyor. Özellikle yanlış yaptığın soruların konularına tekrar çalışmalısın.";
    } else {
        message = "⚠️ Konu eksiklerin var. Bu testi bir öğrenme fırsatı olarak gör. Notlarını baştan okuyup tekrar denemelisin.";
    }

    adviceBox.innerHTML = "<strong>💡 Yapay Zeka Tavsiyesi:</strong><br>" + message;
}