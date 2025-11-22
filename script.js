// --- HOCAM SORULARI BURADAN DÜZENLEYEBİLİRSİNİZ ---
const questions = [
    {
        question: "1. Aşağıdakilerden hangisi bir web tarayıcısı değildir?",
        options: ["Chrome", "Firefox", "Python", "Edge"],
        answer: 2 // (0:A, 1:B, 2:C, 3:D) -> Yani Doğru cevap: Python
    },
    {
        question: "2. HTML'in açılımı nedir?",
        options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Main Link", "Home Tool Markup Language"],
        answer: 0 // Doğru cevap: A şıkkı
    },
    {
        question: "3. CSS ne işe yarar?",
        options: ["Veri tabanı yönetir", "Siteye stil ve görsellik katar", "Sunucu bağlantısı kurar", "Şifreleri saklar"],
        answer: 1 // Doğru cevap: B şıkkı
    },
    {
        question: "4. JavaScript hangi tarafta çalışır?",
        options: ["Sadece Sunucuda", "Sadece Veritabanında", "Hem Tarayıcıda Hem Sunucuda", "Hiçbir yerde"],
        answer: 2 
    }
];

// --- SİSTEM KODLARI (BURAYA DOKUNMANA GEREK YOK) ---
let studentName = "";
let studentNumber = "";

function startQuiz() {
    // İsim ve Numara kontrolü
    const nameInput = document.getElementById('studentName').value;
    const idInput = document.getElementById('studentId').value;

    if (nameInput === "" || idInput === "") {
        alert("Lütfen isim ve numara alanlarını doldurunuz!");
        return;
    }

    studentName = nameInput;
    studentNumber = idInput;

    // Ekran değiştir
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

    // Sonuç Ekranını Göster
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');

    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = Math.round(score);
    
    const feedback = document.getElementById('feedbackMessage');
    if(score >= 50) {
        feedback.innerText = "Tebrikler, Geçtiniz! 🎉";
        feedback.style.color = "green";
    } else {
        feedback.innerText = "Maalesef Kaldınız. 😔";
        feedback.style.color = "red";
    }
}