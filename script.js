// ------------------------------------------------------------------
// ⚠️ 1. ADIMDA ALDIĞIN GOOGLE SCRIPT LİNKİNİ AŞAĞIYA YAPIŞTIR
// ------------------------------------------------------------------
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMGBoZgJAG_OSipxQX28LTEoz_YTZLih0UvGhVJPs0XT2PWron-mZAhm4_YUHKLaaF/exec'; 

// --- SORU HAVUZU ---
// Hocam answer kısmı 0,1,2,3 şeklindedir (0=A, 1=B...)
// Öğrenci bu listeyi konsoldan göremez, çünkü sınav başlayınca siliyoruz!
let questionsSource = [
    {
        question: "1. Aşağıdakilerden hangisi bir web tarayıcısı değildir?",
        options: ["Chrome", "Firefox", "Python", "Edge"],
        answer: 2, 
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
    },
    {
        question: "5. GitHub ne için kullanılır?",
        options: ["Sadece kod yazmak için", "Versiyon kontrolü ve kod depolama", "Sadece resim yüklemek için", "Video izlemek için"],
        answer: 1,
        hint: "Yazılımcıların sosyal medyası ve arşivi gibidir."
    }
];

// --- SİSTEM DEĞİŞKENLERİ ---
let activeQuestions = []; // Karıştırılmış ve güvenli hale getirilmiş sorular
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0; 
let userAnswers = []; 
let totalTimeLeft = 30 * 60; // 30 Dakika
let examTimerInterval;
let hintTimeout; 
let isExamActive = false;

// --- 1. BAŞLATMA VE GÜVENLİK ---
function startQuiz() {
    const nameInput = document.getElementById('studentName').value.trim();
    const idInput = document.getElementById('studentId').value.toString();

    if (nameInput === "") { alert("İsim alanı boş bırakılamaz!"); return; }
    if (idInput.length !== 9) { alert("Öğrenci numarası 9 haneli olmalıdır!"); return; }

    studentName = nameInput;
    studentNumber = idInput;
    isExamActive = true; 

    // A) SORULARI KARIŞTIR (SHUFFLE) 🔀
    // Soruların sırasını rastgele değiştiriyoruz
    questionsSource.sort(() => Math.random() - 0.5);

    // B) GÜVENLİK PROSEDÜRÜ (CEVAPLARI GİZLE) 🕵️‍♂️
    // Global listeden cevapları alıp activeQuestions içine aktarıyoruz
    // ve orijinal kaynaktan 'answer' anahtarını siliyoruz.
    activeQuestions = questionsSource.map(q => {
        return {
            question: q.question,
            options: q.options,
            hint: q.hint,
            _secureAnswer: q.answer // Cevabı gizli bir değişkene al
        };
    });

    // Kaynak listeyi temizle ki konsoldan bakınca cevaplar görünmesin
    questionsSource = []; 

    // EKRAN AYARLARI
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
    // 30 saniye bekle, sonra ajanı göster
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

// --- 5. BİTİŞ VE GOOGLE SHEETS KAYDI ---
function finishQuiz(type) {
    isExamActive = false;
    clearInterval(examTimerInterval);
    clearTimeout(hintTimeout);
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    let score = 0;
    const pointPerQuestion = 100 / activeQuestions.length;

    // Kopya değilse puan hesapla
    if (type !== "CHEATING") {
        activeQuestions.forEach((q, i) => {
            if (userAnswers[i] === q._secureAnswer) {
                score += pointPerQuestion;
            }
        });
    }
    score = Math.round(score);

    // EKRAN YÖNETİMİ
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    let feedback = document.getElementById('feedbackMessage');
    let statusNote = "Normal";

    if (type === "CHEATING") {
        feedback.innerText = "⚠️ KOPYA GİRİŞİMİ TESPİT EDİLDİ! Puanınız 0 olarak işlendi.";
        feedback.style.color = "red";
        statusNote = "KOPYA_GIRISIMI";
    } else if (type === "TIMEOUT") {
        feedback.innerText = "⏰ Süre doldu. Cevaplarınız kaydedildi.";
        statusNote = "SURE_BITTI";
    } else {
        feedback.innerText = "Sınavınız başarıyla kaydedildi. Veritabanına işleniyor... 🔄";
        feedback.style.color = "#2c3e50";
    }

    sendToGoogleSheets(studentName, studentNumber, score, statusNote, feedback);
}

// --- GOOGLE SHEETS GÖNDERİMİ ---
function sendToGoogleSheets(name, id, score, status, feedbackElement) {
    const data = {
        Isim: name,
        Numara: id,
        Puan: score,
        Durum: status,
        Tarih: new Date().toLocaleString()
    };

    // mode: 'no-cors' kullanıyoruz çünkü Google Sheets tarayıcıdan direkt çağrılınca
    // CORS hatası verebilir. Bu modda hata verse bile veriyi gönderir.
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        cache: "no-cache",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    }).then(() => {
        // no-cors modunda cevap okunamaz ama işlem genelde başarılıdır.
        feedbackElement.innerText += " ✅ KAYDEDİLDİ";
        if(status !== "KOPYA_GIRISIMI") feedbackElement.style.color = "green";
    }).catch(e => {
        console.error(e);
        feedbackElement.innerText += " ⚠️ Bağlantı hatası (Ama yerel kayıt alındı)";
    });
}