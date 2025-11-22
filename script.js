// ---------------------------------------------------------
// ⚠️ AŞAĞIDAKİ LİNKE FORMSPREE'DEN ALDIĞIN LİNKİ YAPIŞTIR
// Örnek: "https://formspree.io/f/xknpdqwe"
// ---------------------------------------------------------
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xrbdldnj'; 


// --- SORULAR (İstediğin gibi değiştir hocam) ---
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

function startQuiz() {
    const nameInput = document.getElementById('studentName').value;
    const idInput = document.getElementById('studentId').value;

    if (nameInput === "" || idInput === "") {
        alert("Lütfen isim ve numara alanlarını doldurunuz!");
        return;
    }

    studentName = nameInput;
    studentNumber = idInput;

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = "Öğrenci: " + studentName;

    loadQuestions();
}

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

function finishQuiz() {
    let score = 0;
    const pointPerQuestion = 100 / questions.length;

    questions.forEach((q, index) => {
        const selectedOption = document.querySelector(`input[name="q${index}"]:checked`);
        if (selectedOption && parseInt(selectedOption.value) === q.answer) {
            score += pointPerQuestion;
        }
    });

    const finalScore = Math.round(score);

    // Sonuç Ekranını Göster
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');

    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = finalScore;
    
    const feedback = document.getElementById('feedbackMessage');
    if(finalScore >= 50) {
        feedback.innerText = "Tebrikler, Geçtiniz! Sonuç hocaya iletiliyor... ⏳";
        feedback.style.color = "orange";
    } else {
        feedback.innerText = "Maalesef Kaldınız. Sonuç hocaya iletiliyor... ⏳";
        feedback.style.color = "orange";
    }

    // --- MAİL GÖNDERME İŞLEMİ (GİZLİCE) ---
    sendEmailToTeacher(studentName, studentNumber, finalScore, feedback);
}

function sendEmailToTeacher(name, id, score, feedbackElement) {
    
    // Formspree'ye gidecek veri paketi
    const data = {
        Öğrenci_Adı: name,
        Öğrenci_No: id,
        Puan: score,
        Tarih: new Date().toLocaleString()
    };

    fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
            'Accept': 'application/json'
        }
    }).then(response => {
        if (response.ok) {
            feedbackElement.innerText += " ✅ İLETİLDİ";
            feedbackElement.style.color = score >= 50 ? "green" : "red";
        } else {
            feedbackElement.innerText += " ❌ HATA OLUŞTU";
            alert("Sonuç gönderilemedi! Lütfen ekran görüntüsü alınız.");
        }
    }).catch(error => {
        feedbackElement.innerText += " ❌ HATA OLUŞTU";
        alert("İnternet bağlantısı hatası! Ekran görüntüsü alınız.");
    });
}