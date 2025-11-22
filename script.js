// ---------------------------------------------------------
// ⚠️ LİNKİ YAPIŞTIRMAYI UNUTMA HOCAM
// ---------------------------------------------------------
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xrbdldnj'; 

const questions = [
    {
        question: "1. Aşağıdakilerden hangisi bir web tarayıcısı değildir?",
        options: ["Chrome", "Firefox", "Python", "Edge"],
        answer: 2 
    },
    {
        question: "2. HTML'in açılımı nedir?",
        options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Main Link", "Home Tool Markup Language"],
        answer: 0 
    },
    {
        question: "3. CSS ne işe yarar?",
        options: ["Veri tabanı yönetir", "Siteye stil ve görsellik katar", "Sunucu bağlantısı kurar", "Şifreleri saklar"],
        answer: 1 
    },
    {
        question: "4. JavaScript hangi tarafta çalışır?",
        options: ["Sadece Sunucuda", "Sadece Veritabanında", "Hem Tarayıcıda Hem Sunucuda", "Hiçbir yerde"],
        answer: 2 
    }
];

let studentName = "";
let studentNumber = "";
let timerInterval;
let timeLeft = 30 * 60; // 30 Dakika (Saniye cinsinden)
let isExamActive = false; // Sınavın aktif olup olmadığını takip eder

// --- SINAVI BAŞLAT ---
function startQuiz() {
    const nameInput = document.getElementById('studentName').value;
    const idInput = document.getElementById('studentId').value;

    if (nameInput === "" || idInput === "") {
        alert("Lütfen isim ve numara alanlarını doldurunuz!");
        return;
    }

    studentName = nameInput;
    studentNumber = idInput;
    isExamActive = true; // Sınav başladı

    // Ekran değiştir
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = "Öğrenci: " + studentName;

    // Soruları Yükle
    loadQuestions();
    
    // Sayacı Başlat
    startTimer();

    // Kopya Korumasını Aktif Et (Sekme Değiştirme Kontrolü)
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- SORULARI YÜKLE ---
function loadQuestions() {
    const container = document.getElementById('questionContainer');
    container.innerHTML = "";

    questions.forEach((q, index) => {
        let optionsHtml = "";
        q.options.forEach((opt, i) => {
            optionsHtml += `
                <label>
                    <input type="radio" name="q${index}" value="${i}">
                    ${opt}
                </label>
            `;
        });

        container.innerHTML += `
            <div class="question-box">
                <p><strong>${q.question}</strong></p>
                <div class="options">${optionsHtml}</div>
            </div>
        `;
    });
}

// --- GERİ SAYIM SAYACI ---
function startTimer() {
    const timerDisplay = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        if(timeLeft <= 0) {
            clearInterval(timerInterval);
            finishQuiz("TIMEOUT"); // Süre bitti
        } else {
            timeLeft--;
            let minutes = Math.floor(timeLeft / 60);
            let seconds = timeLeft % 60;
            // 09:05 gibi görünmesi için başına 0 ekle
            seconds = seconds < 10 ? '0' + seconds : seconds;
            minutes = minutes < 10 ? '0' + minutes : minutes;
            timerDisplay.innerText = `Süre: ${minutes}:${seconds}`;
            
            // Son 1 dakika kala kırmızı yap
            if(timeLeft < 60) timerDisplay.style.color = "red";
        }
    }, 1000);
}

// --- KOPYA KORUMASI (SEKME DEĞİŞTİRME) ---
function handleVisibilityChange() {
    if (document.hidden && isExamActive) {
        finishQuiz("CHEATING"); // Sekme değişti, kopya girişimi!
    }
}

// --- SINAVI BİTİR ---
// type: 'NORMAL', 'TIMEOUT' (Süre bitti) veya 'CHEATING' (Kopya)
function finishQuiz(type = 'NORMAL') {
    // Önce her şeyi durdur
    isExamActive = false;
    clearInterval(timerInterval);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0;
    let feedbackMsg = "";
    let resultColor = "";

    if (type === "CHEATING") {
        // Kopya durumunda puan hesaplanmaz, direkt 0 basılır.
        score = 0;
        feedbackMsg = "⚠️ KOPYA GİRİŞİMİ TESPİT EDİLDİ! Sekme değiştirdiğiniz için sınavınız geçersiz sayıldı.";
        resultColor = "red";
    } else {
        // Normal bitiş veya süre bitimi, puanı hesapla
        const pointPerQuestion = 100 / questions.length;
        questions.forEach((q, index) => {
            const selectedOption = document.querySelector(`input[name="q${index}"]:checked`);
            if (selectedOption && parseInt(selectedOption.value) === q.answer) {
                score += pointPerQuestion;
            }
        });
        score = Math.round(score);

        if (type === "TIMEOUT") {
            feedbackMsg = "⏰ Süre doldu! Mevcut cevaplarınız gönderiliyor...";
            resultColor = "orange";
        } else if (score >= 50) {
            feedbackMsg = "Tebrikler, Geçtiniz! Sonuç hocaya iletiliyor...";
            resultColor = "green";
        } else {
            feedbackMsg = "Maalesef Kaldınız. Sonuç hocaya iletiliyor...";
            resultColor = "red";
        }
    }

    // Sonuç Ekranını Göster
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    // Butonu gizle ki tekrar basamasınlar
    document.querySelector('#resultScreen button').innerText = "Sınav Bitti"; 

    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;
    
    const feedbackElement = document.getElementById('feedbackMessage');
    feedbackElement.innerText = feedbackMsg;
    feedbackElement.style.color = resultColor;

    // Mail Konusunu Belirle (Hoca ne olduğunu anlasın)
    let statusNote = "";
    if (type === "CHEATING") statusNote = " (KOPYA GİRİŞİMİ - İPTAL)";
    else if (type === "TIMEOUT") statusNote = " (SÜRE BİTTİ)";

    sendEmailToTeacher(studentName, studentNumber, score, feedbackElement, statusNote);
}

// --- MAIL GÖNDERME ---
function sendEmailToTeacher(name, id, score, feedbackElement, statusNote) {
    
    const data = {
        Öğrenci_Adı: name,
        Öğrenci_No: id,
        Puan: score + statusNote, // Mailde puanın yanına not düş
        Durum: statusNote === "" ? "Normal Teslim" : statusNote,
        Tarih: new Date().toLocaleString()
    };

    fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { 'Accept': 'application/json' }
    }).then(response => {
        if (response.ok) {
            feedbackElement.innerText += " ✅ SONUÇ KAYDEDİLDİ";
        } else {
            feedbackElement.innerText += " ❌ Sunucu Hatası (Ama yerel kayıt alındı)";
        }
    }).catch(error => {
        feedbackElement.innerText += " ❌ İnternet Hatası";
    });
}