// ---------------------------------------------------------
// ⚠️ BURAYA KENDİ FORMSPREE LİNKİNİ YAPIŞTIR
// Örnek: "https://formspree.io/f/xknpdqwe"
// ---------------------------------------------------------
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xrbdldnj'; 

// --- SORULAR, CEVAPLAR VE İPUÇLARI ---
const questions = [
    {
        question: "1. Aşağıdakilerden hangisi bir web tarayıcısı değildir?",
        options: ["Chrome", "Firefox", "Python", "Edge"],
        answer: 2, // C şıkkı (0,1,2..)
        hint: "Python bir programlama dilidir, internette gezmeni sağlamaz. 😉"
    },
    {
        question: "2. HTML'in açılımı nedir?",
        options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Main Link", "Home Tool Markup Language"],
        answer: 0,
        hint: "İçinde 'Markup' (İşaretleme) geçen şıkkı ara. 📄"
    },
    {
        question: "3. CSS ne işe yarar?",
        options: ["Veri tabanı yönetir", "Siteye stil ve görsellik katar", "Sunucu bağlantısı kurar", "Şifreleri saklar"],
        answer: 1,
        hint: "Makyaj malzemesi gibi düşün. Sitenin güzel görünmesini sağlar. 💄"
    },
    {
        question: "4. JavaScript hangi tarafta çalışır?",
        options: ["Sadece Sunucuda", "Sadece Veritabanında", "Hem Tarayıcıda Hem Sunucuda", "Hiçbir yerde"],
        answer: 2,
        hint: "Modern JS artık her yerde çalışıyor, Node.js'i hatırla. 🌍"
    }
];

// --- DEĞİŞKENLER ---
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; // Cevapları tutar
let totalTimeLeft = 30 * 60; // 30 Dakika
let examTimerInterval;
let hintTimeout; // Ajan sayacı
let isExamActive = false;

// --- 1. BAŞLANGIÇ KONTROLLERİ ---
function startQuiz() {
    const nameInput = document.getElementById('studentName').value.trim();
    const idInput = document.getElementById('studentId').value.toString();

    // İsim Kontrolü
    if (nameInput === "") {
        alert("Lütfen isminizi giriniz!");
        return;
    }
    // 9 Hane Numara Kontrolü
    if (idInput.length !== 9) {
        alert("⚠️ HATA: Öğrenci numarası tam olarak 9 haneli olmalıdır! (Şu anki hane: " + idInput.length + ")");
        return;
    }

    studentName = nameInput;
    studentNumber = idInput;
    isExamActive = true; 

    // EKRAN GEÇİŞİ
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = "Öğrenci: " + studentName;

    // Cevap dizisini hazırla
    userAnswers = new Array(questions.length).fill(null);

    // İLK İŞLEMLER
    showQuestion(0);
    startExamTimer();
    
    // KOPYA KORUMASINI AKTİF ET
    document.addEventListener("visibilitychange", handleVisibilityChange);
}

// --- 2. SORU GÖSTERME (SLAYT) ---
function showQuestion(index) {
    // Eski ajanı gizle ve sayacı sıfırla
    hideAgent();
    
    const q = questions[index];
    document.getElementById('qTitle').innerText = `Soru ${index + 1} / ${questions.length}`;
    document.getElementById('qText').innerText = q.question;
    
    const optionsDiv = document.getElementById('qOptions');
    optionsDiv.innerHTML = ""; 

    // Şıkları oluştur
    q.options.forEach((opt, i) => {
        const isChecked = userAnswers[index] === i ? "checked" : "";
        optionsDiv.innerHTML += `
            <label onclick="selectOption(${index}, ${i})">
                <input type="radio" name="option" ${isChecked}>
                ${opt}
            </label>
        `;
    });

    // Buton metni (Son soru mu?)
    const btn = document.getElementById('nextBtn');
    if (index === questions.length - 1) {
        btn.innerText = "Sınavı Bitir ✅";
        btn.setAttribute("onclick", "finishQuiz('NORMAL')");
    } else {
        btn.innerText = "Sonraki Soru ➡️";
        btn.setAttribute("onclick", "nextQuestion()");
    }

    // AJAN SAYACINI BAŞLAT (30 saniye sonra)
    startHintTimer(index);
}

// --- CEVAP SEÇME ---
function selectOption(qIndex, optionIndex) {
    userAnswers[qIndex] = optionIndex;
}

// --- SONRAKİ SORU ---
function nextQuestion() {
    // İstersek burada "Boş bırakamazsınız" kontrolü yapabiliriz.
    // Şimdilik serbest bırakıyoruz.
    currentQuestionIndex++;
    showQuestion(currentQuestionIndex);
}

// --- AJAN SİSTEMİ 🕵️ ---
function startHintTimer(qIndex) {
    if (hintTimeout) clearTimeout(hintTimeout);
    
    // 30 saniye (30000ms) bekle, sonra ajanı göster
    hintTimeout = setTimeout(() => {
        showAgent(questions[qIndex].hint);
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

// --- SÜRE SAYACI ⏱️ ---
function startExamTimer() {
    const timerDisplay = document.getElementById('timer');
    examTimerInterval = setInterval(() => {
        if(totalTimeLeft <= 0) {
            finishQuiz("TIMEOUT");
        } else {
            totalTimeLeft--;
            let m = Math.floor(totalTimeLeft / 60);
            let s = totalTimeLeft % 60;
            timerDisplay.innerText = `Kalan Süre: ${m}:${s < 10 ? '0'+s : s}`;
            
            if(totalTimeLeft < 60) timerDisplay.style.color = "red";
        }
    }, 1000);
}

// --- KOPYA KORUMASI (SEKME DEĞİŞTİRME) 🛡️ ---
function handleVisibilityChange() {
    if (document.hidden && isExamActive) {
        finishQuiz("CHEATING");
    }
}

// --- SINAVI BİTİRME ---
function finishQuiz(type) {
    isExamActive = false;
    clearInterval(examTimerInterval);
    clearTimeout(hintTimeout); // Ajanı sustur
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0;
    const pointPerQuestion = 100 / questions.length;

    // Kopya değilse puanı hesapla
    if (type !== "CHEATING") {
        questions.forEach((q, i) => {
            if (userAnswers[i] === q.answer) {
                score += pointPerQuestion;
            }
        });
    }
    score = Math.round(score);

    // EKRANLARI YÖNET
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "";

    // DURUMA GÖRE MESAJ
    if (type === "CHEATING") {
        feedback.innerText = "⚠️ KOPYA GİRİŞİMİ TESPİT EDİLDİ! Sınavınız iptal edildi.";
        feedback.style.color = "red";
        statusNote = " (KOPYA - İPTAL)";
    } else if (type === "TIMEOUT") {
        feedback.innerText = "⏰ Süre doldu. Mevcut cevaplarınız kaydedildi.";
        statusNote = " (SÜRE BİTTİ)";
    } else {
        feedback.innerText = score >= 50 ? "Tebrikler Geçtiniz! Sonuç hocaya iletiliyor..." : "Kaldınız. Sonuç hocaya iletiliyor...";
        feedback.style.color = score >= 50 ? "green" : "orange";
        statusNote = " (Normal Teslim)";
    }

    // MAİL GÖNDER
    sendEmailToTeacher(studentName, studentNumber, score, feedback, statusNote);
}

// --- MAİL GÖNDERME FONKSİYONU 📧 ---
function sendEmailToTeacher(name, id, score, feedbackElement, statusNote) {
    const data = {
        Öğrenci: name,
        No: id,
        Puan: score,
        Durum: statusNote,
        Tarih: new Date().toLocaleString()
    };

    fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { 'Accept': 'application/json' }
    }).then(r => {
        if(r.ok) feedbackElement.innerText += " ✅ İLETİLDİ";
        else feedbackElement.innerText += " ❌ HATA";
    }).catch(e => feedbackElement.innerText += " ❌ HATA");
}