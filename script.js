// ==================================================================
// GOOGLE APPS SCRIPT WEB APP URL'İNİ BURAYA YAPIŞTIR
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMm4kb8HNJpdZ9g54eXHX7I_XXZmratpSw4jIeZLc1OUdi9zlzm-1_FPYGcwDziWgf/exec';

// Global değişkenler
let questionsSource = [];
let activeQuestions = [];
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0;
let userAnswers = [];
let totalTimeLeft = 30 * 60; // 30 dk
let examTimerInterval = null;
let hintTimeout = null;
let isExamActive = false;
let hasAttemptedFullscreen = false;

// -----------------------------------------------------
// YARDIMCI FONKSİYONLAR
// -----------------------------------------------------
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function obfuscateAnswer(answer) {
    try {
        return btoa(encodeURIComponent(answer)).split("").reverse().join("");
    } catch (e) {
        return answer;
    }
}

function deobfuscateAnswer(obf) {
    try {
        return decodeURIComponent(atob(obf.split("").reverse().join("")));
    } catch (e) {
        return obf;
    }
}

function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.mozRequestFullScreen) return elem.mozRequestFullScreen();
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen();
    if (elem.msRequestFullscreen) return elem.msRequestFullscreen();
    return Promise.resolve();
}

// -----------------------------------------------------
// BAŞLANGIÇ
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const idInput = document.getElementById('studentId');

    // 9 hane sınırı
    idInput.addEventListener('input', () => {
        if (idInput.value.length > 9) {
            idInput.value = idInput.value.slice(0, 9);
        }
    });

    startBtn.addEventListener('click', startQuizAttempt);

    // Soruları çek
    fetch(GOOGLE_SCRIPT_URL)
        .then(r => r.json())
        .then(data => {
            console.log("Gelen soru verisi:", data);

            if (Array.isArray(data)) {
                questionsSource = data;
            } else if (Array.isArray(data.questions)) {
                questionsSource = data.questions;
            } else if (Array.isArray(data.data)) {
                questionsSource = data.data;
            } else if (data.error) {
                console.error(data.error);
                questionsSource = [];
            }

            if (!questionsSource || questionsSource.length === 0) {
                startBtn.innerText = "Soru Yok (Admin ile görüşün)";
            } else {
                startBtn.innerText = "Sınavı Başlat";
            }
            startBtn.disabled = false;
        })
        .catch(err => {
            console.error("Soru çekme hatası:", err);
            startBtn.innerText = "Sınavı Başlat (Offline/Hata)";
            startBtn.disabled = false;
        });

    // Anti-cheat eventleri
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // Bazı kısayolları engelle (F12, Ctrl+U vb.)
    document.onkeydown = function (e) {
        if (e.keyCode === 123) return false; // F12
        if (e.ctrlKey && e.keyCode === 85) return false; // Ctrl+U
    };
});

// -----------------------------------------------------
// GİRİŞ VE BAŞLAT
// -----------------------------------------------------
async function startQuizAttempt() {
    const idInput = document.getElementById('studentId');
    const startBtn = document.getElementById('startBtn');

    const id = (idInput.value || "").trim();

    if (id.length !== 9) {
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Öğrenci numarası 9 haneli olmalıdır.' });
        return;
    }

    startBtn.disabled = true;
    const originalText = startBtn.innerText;
    startBtn.innerText = "Kontrol Ediliyor... 🔄";

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "CHECK_ACCESS", Numara: id })
        });

        const result = await response.json();
        console.log("CHECK_ACCESS:", result);

        if (result.status === "error") {
            Swal.fire({ icon: 'error', title: 'Giriş Başarısız', text: result.message });
            startBtn.disabled = false;
            startBtn.innerText = originalText;
            return;
        }

        // Başarılı
        studentName = result.name || document.getElementById('studentName').value || "Öğrenci";
        studentNumber = id;

        try { await openFullscreen(); } catch (e) { console.warn("Fullscreen açılamadı:", e); }

        setTimeout(() => {
            hasAttemptedFullscreen = true;
            try {
                initializeQuiz();
            } catch (e) {
                console.error("initializeQuiz hatası:", e);
                Swal.fire('Hata', 'Sınav başlatılırken hata oluştu.', 'error');
                startBtn.disabled = false;
                startBtn.innerText = originalText;
            }
        }, 300);

    } catch (e) {
        console.error("CHECK_ACCESS hata:", e);
        Swal.fire({ icon: 'error', title: 'Bağlantı Hatası', text: 'Sistem URL hatası veya internet yok.' });
        startBtn.disabled = false;
        startBtn.innerText = originalText;
    }
}

// -----------------------------------------------------
// SINAV BAŞLATMA
// -----------------------------------------------------
function initializeQuiz() {
    if (!Array.isArray(questionsSource) || questionsSource.length === 0) {
        Swal.fire('Soru Yok', 'Sistemde yüklü soru bulunamadı.', 'warning');
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerText = "Sınavı Başlat";
        }
        return;
    }

    isExamActive = true;

    const shuffledQuestions = shuffleArray([...questionsSource]);

    activeQuestions = shuffledQuestions.map(q => {
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsWithIndex = options.map((opt, idx) => ({ val: opt, originalIdx: idx }));
        const shuffledOptionsMap = shuffleArray(optionsWithIndex);
        const finalOptions = shuffledOptionsMap.map(o => o.val);

        let newAnswerIndex;
        if (q.type === 'text') {
            newAnswerIndex = q.answer;
        } else if (q.type === 'checkbox') {
            // Çoklu cevap: "0,2" gibi saklanıyor varsayalım
            newAnswerIndex = q.answer || "";
        } else {
            newAnswerIndex = shuffledOptionsMap.findIndex(o => o.originalIdx.toString() === q.answer.toString());
        }

        return {
            ...q,
            options: finalOptions,
            _secureAnswer: obfuscateAnswer(newAnswerIndex !== -1 && newAnswerIndex !== undefined ? newAnswerIndex.toString() : ""),
            topic: q.topic || "Genel",
            image: q.image || ""
        };
    });

    userAnswers = new Array(activeQuestions.length).fill(null);

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;

    currentQuestionIndex = 0;
    showQuestion(currentQuestionIndex);
    startExamTimer();
}

// -----------------------------------------------------
// SORU GÖSTERME
// -----------------------------------------------------
function showQuestion(index) {
    if (index < 0 || index >= activeQuestions.length) return;

    const q = activeQuestions[index];

    const progress = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;

    document.getElementById('qIndex').innerText = `SORU ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerHTML = q.question;

    const imgEl = document.getElementById('qImage');
    if (q.image && typeof q.image === 'string' && q.image.startsWith('http')) {
        imgEl.src = q.image;
        imgEl.style.display = 'block';
    } else {
        imgEl.src = "";
        imgEl.style.display = 'none';
    }

    renderOptions(q, index);

    const nextBtn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        nextBtn.innerText = "Sınavı Bitir ✅";
        nextBtn.onclick = confirmFinishQuiz;
    } else {
        nextBtn.innerText = "Sonraki Soru ➡️";
        nextBtn.onclick = nextQuestion;
    }

    const agentBox = document.getElementById('agentBox');
    agentBox.classList.add('hidden');
    if (hintTimeout) clearTimeout(hintTimeout);

    if (q.hint) {
        hintTimeout = setTimeout(() => {
            document.getElementById('agentText').innerText = q.hint;
            agentBox.classList.remove('hidden');
        }, 45000);
    }

    if (window.MathJax) {
        MathJax.typesetPromise([document.getElementById('quizScreen')]).catch(() => {});
    }
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = "";
    const currentUserAnswer = userAnswers[index];

    if (q.type === 'text') {
        div.innerHTML = `
            <textarea class="text-answer-input" rows="3" placeholder="Cevabınızı yazın..."
                oninput="saveAnswer(${index}, this.value.trim())">${currentUserAnswer || ''}</textarea>`;
        return;
    }

    if (q.type === 'checkbox') {
        let selectedIndices = currentUserAnswer ? JSON.parse(currentUserAnswer) : [];
        q.options.forEach((opt, i) => {
            const isChecked = selectedIndices.includes(i);
            const label = document.createElement('label');
            label.className = isChecked ? 'selected' : '';
            label.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''}><span>${opt}</span>`;
            label.addEventListener('click', () => toggleCheckbox(label, index, i));
            div.appendChild(label);
        });
        return;
    }

    // radio
    q.options.forEach((opt, i) => {
        const isChecked = (currentUserAnswer !== null && parseInt(currentUserAnswer) === i);
        const label = document.createElement('label');
        if (isChecked) label.classList.add('selected');
        label.innerHTML = `<input type="radio" name="opt${index}" ${isChecked ? 'checked' : ''}><span>${opt}</span>`;
        label.addEventListener('click', () => selectRadio(label, index, i));
        div.appendChild(label);
    });
}

function saveAnswer(index, value) {
    userAnswers[index] = value;
}

function selectRadio(el, qIdx, optIdx) {
    const parent = el.parentNode;
    parent.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    saveAnswer(qIdx, optIdx.toString());
}

function toggleCheckbox(el, qIdx, optIdx) {
    const cb = el.querySelector('input');
    cb.checked = !cb.checked;
    cb.checked ? el.classList.add('selected') : el.classList.remove('selected');

    let selected = userAnswers[qIdx] ? JSON.parse(userAnswers[qIdx]) : [];
    if (cb.checked) {
        if (!selected.includes(optIdx)) selected.push(optIdx);
    } else {
        selected = selected.filter(x => x !== optIdx);
    }
    saveAnswer(qIdx, JSON.stringify(selected));
}

function nextQuestion() {
    if (currentQuestionIndex < activeQuestions.length - 1) {
        currentQuestionIndex++;
        showQuestion(currentQuestionIndex);
    }
}

// -----------------------------------------------------
// ZAMANLAYICI
// -----------------------------------------------------
function startExamTimer() {
    totalTimeLeft = 30 * 60;
    const timerEl = document.getElementById('timer');
    const wrapper = document.getElementById('timerWrapper');

    if (examTimerInterval) clearInterval(examTimerInterval);

    examTimerInterval = setInterval(() => {
        if (totalTimeLeft <= 0) {
            finishQuiz("TIMEOUT");
            return;
        }

        totalTimeLeft--;
        const m = Math.floor(totalTimeLeft / 60);
        const s = totalTimeLeft % 60;
        timerEl.innerText = `${m}:${s < 10 ? '0' + s : s}`;

        if (totalTimeLeft < 60) wrapper.classList.add('timer-urgent');
        else wrapper.classList.remove('timer-urgent');
    }, 1000);
}

// -----------------------------------------------------
// SINAVI BİTİRME
// -----------------------------------------------------
function confirmFinishQuiz() {
    Swal.fire({
        title: 'Sınavı Bitir?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Bitir ✅',
        cancelButtonText: 'İptal'
    }).then((r) => {
        if (r.isConfirmed) finishQuiz('NORMAL');
    });
}

function finishQuiz(type) {
    if (!isExamActive) return;
    isExamActive = false;

    clearInterval(examTimerInterval);
    if (hintTimeout) clearTimeout(hintTimeout);

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    let score = 0;
    const pointsPerQuestion = 100 / activeQuestions.length;

    activeQuestions.forEach((q, i) => {
        if (type === "CHEATING_TAB" || type === "CHEATING_ESC") return;

        const correct = deobfuscateAnswer(q._secureAnswer);
        const user = userAnswers[i];
        let isOk = false;

        if (q.type === 'checkbox') {
            const userStr = user ? JSON.parse(user).sort().join(',') : "";
            const correctStr = q.answer ? q.answer.split(',').map(s => s.trim()).sort().join(',') : "";
            isOk = (userStr === correctStr && userStr !== "");
        } else if (q.type === 'text') {
            isOk = (user && user.toLowerCase().trim() === correct.toLowerCase().trim());
        } else {
            isOk = (user === correct);
        }

        if (isOk) score += pointsPerQuestion;
    });

    score = Math.round(score);

    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    if (type === "CHEATING_TAB" || type === "CHEATING_ESC") {
        fb.innerHTML = `⚠️ SINAV İPTAL!<br>Sebep: Güvenlik İhlali`;
        fb.style.color = "#ef4444";
        statusNote = "KOPYA";
    } else if (type === "TIMEOUT") {
        fb.innerText = "⏰ Süre doldu.";
        fb.style.color = "#f59e0b";
        statusNote = "SURE_BITTI";
    } else if (score >= 50) {
        fb.innerText = "Tebrikler! Geçtiniz. 🎉";
        fb.style.color = "#10b981";
    } else {
        fb.innerText = "Maalesef kaldınız.";
        fb.style.color = "#6b7280";
    }

    generateReviewPanel();

    sendToGoogleSheets({
        type: "RESULT",
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote,
        Zayif_Konu: ""
    }, fb);
}

// Anti-cheat
function handleVisibilityChange() {
    if (document.hidden && isExamActive) {
        finishQuiz("CHEATING_TAB");
    }
}

function handleFullscreenChange() {
    if (!document.fullscreenElement && isExamActive && hasAttemptedFullscreen) {
        finishQuiz("CHEATING_ESC");
    }
}

// -----------------------------------------------------
// CEVAP ANAHTARI
// -----------------------------------------------------
function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";

    activeQuestions.forEach((q, i) => {
        const correct = deobfuscateAnswer(q._secureAnswer);
        const user = userAnswers[i];
        let ok = false;
        let userDisplay = "";
        let correctDisplay = "";

        if (q.type === 'text') {
            ok = (user && user.toLowerCase().trim() === correct.toLowerCase().trim());
            userDisplay = user || "(Boş)";
            correctDisplay = correct;
        } else if (q.type === 'checkbox') {
            const userIndices = user ? JSON.parse(user) : [];
            const correctIndices = (q.answer || "").split(',').map(s => parseInt(s.trim())).filter(x => !isNaN(x));
            const userStr = userIndices.sort().join(',');
            const correctStr = correctIndices.sort().join(',');
            ok = (userStr === correctStr && userStr !== "");

            userDisplay = userIndices.length
                ? userIndices.map(idx => q.options[idx]).join(', ')
                : "(Boş)";
            correctDisplay = correctIndices.length
                ? correctIndices.map(idx => q.options[idx]).join(', ')
                : "";
        } else {
            ok = (user === correct);
            userDisplay = (user !== null && user !== undefined)
                ? q.options[parseInt(user)]
                : "(Boş)";
            correctDisplay = q.options[parseInt(correct)];
        }

        const item = document.createElement('div');
        item.className = `review-item ${ok ? 'correct' : 'wrong'}`;
        item.innerHTML = `
            <b>${i + 1}. ${q.question}</b><br>
            <b>Sizin cevabınız:</b> ${userDisplay}<br>
            <b>Doğru cevap:</b> ${correctDisplay}
        `;
        div.appendChild(item);
    });

    if (window.MathJax) {
        MathJax.typesetPromise([div]).catch(() => {});
    }
}

function toggleReview() {
    document.getElementById('reviewArea').classList.toggle('hidden');
}

// -----------------------------------------------------
// GOOGLE SHEETS'E GÖNDER
// -----------------------------------------------------
function sendToGoogleSheets(data, fbElement) {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(data)
    })
        .then(r => r.json())
        .then(res => {
            console.log("RESULT kayıt cevabı:", res);
            if (res.status === 'success' && fbElement) {
                fbElement.innerHTML += " ✅";
            }
        })
        .catch(err => {
            console.error("RESULT kayıt hatası:", err);
        });
}
