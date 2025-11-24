// ==================================================================
// ⚠️ DİKKAT: BURADAKİ URL SİZİN KENDİ APPSCRIPT URL'NİZ OLMALI
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7kwbKhfGSQpkud9EB6je-KwCKsyxujHSu-yvXPE3dfdiXX8odvaexBNUCBHbDjKB2/exec';

// Global değişkenler
let questionsSource = [];
let activeQuestions = [];
let studentName = "";
let studentNumber = "";
let currentQuestionIndex = 0;
let userAnswers = [];
let totalTimeLeft = 30 * 60; 
let examTimerInterval = null;
let hintTimeout = null;
let isExamActive = false;
let hasAttemptedFullscreen = false;
let userObjections = {}; // İtirazları burada tutacağız

// -----------------------------------------------------
// BAŞLANGIÇ & EVENT LISTENERLAR
// -----------------------------------------------------
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// 2. Sayfa açılınca tercihi hatırla
document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const studentIdInput = document.getElementById('studentId');
    
    // 1. SORULARI ÇEK
    fetch(GOOGLE_SCRIPT_URL)
        .then(r => r.json())
        .then(data => {
            if (Array.isArray(data)) questionsSource = data;
            
            if (!questionsSource || questionsSource.length === 0) {
                startBtn.innerText = "Soru Yok (Yönetici Girişi Yapın)";
            } else {
                startBtn.innerText = "Giriş Yap ve Başlat";
            }
        })
        .catch(err => {
            console.error("Veri hatası:", err);
            startBtn.innerText = "Bağlantı Hatası (Sayfayı Yenile)";
        });

    // 2. OTOMATİK İSİM GETİRME (Klavye hareketine duyarlı)
    studentIdInput.addEventListener('input', async function() {
        const numara = this.value.trim();
        const nameDisplay = document.getElementById('studentNameDisplay');

        // Numara 9 hane olduğunda otomatik sorgula (Tıklama gerektirmez)
        if(numara.length === 9) {
            nameDisplay.value = "Aranıyor...";
            nameDisplay.style.color = "#4F46E5"; // Mavi renk

            try {
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({ type: "CHECK_ACCESS", Numara: numara })
                });
                
                const result = await response.json();
                
                if(result.status === "success" && result.name) {
                    nameDisplay.value = result.name;
                    nameDisplay.style.color = "green"; // Bulununca yeşil olsun
                    studentName = result.name; 
                } else {
                    nameDisplay.value = result.message || "Kayıt Bulunamadı";
                    nameDisplay.style.color = "red";
                }
            } catch (error) {
                console.error(error);
                nameDisplay.value = "Bağlantı Hatası!";
            }
        } else {
            // 9 haneden azsa veya silerse kutuyu temizle
            if(numara.length < 9) {
                nameDisplay.value = ""; 
            }
        }
    });

    // Güvenlik önlemleri
    document.addEventListener("visibilitychange", () => { if(document.hidden && isExamActive) finishQuiz("CHEATING_TAB"); });
    document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && isExamActive && hasAttemptedFullscreen) finishQuiz("CHEATING_ESC"); });
    document.onkeydown = function (e) { if (e.keyCode === 123 || (e.ctrlKey && e.keyCode === 85)) return false; };
});

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
    try { return btoa(encodeURIComponent(answer)).split("").reverse().join(""); } catch (e) { return answer; }
}
function deobfuscateAnswer(obf) {
    try { return decodeURIComponent(atob(obf.split("").reverse().join(""))); } catch (e) { return obf; }
}

function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen();
    return Promise.resolve();
}

// -----------------------------------------------------
// GİRİŞ VE BAŞLATMA (DÜZELTİLDİ: DONMA SORUNU ÇÖZÜLDÜ)
// -----------------------------------------------------
async function startQuizAttempt() {
    const idInput = document.getElementById('studentId');
    const startBtn = document.getElementById('startBtn');
    const id = idInput.value.toString().trim();

    // Validasyon
    if (id.length !== 9) {
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Öğrenci numarası 9 haneli olmalıdır.' });
        return;
    }

    // Butonu Kilitle
    startBtn.disabled = true;
    const originalText = startBtn.innerText;
    startBtn.innerText = "Kontrol Ediliyor... 🔄";

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "CHECK_ACCESS", Numara: id })
        });
        
        // Yanıtın JSON olup olmadığını kontrol et
        if (!response.ok) throw new Error("Sunucu hatası");
        
        const result = await response.json();

        if (result.status === "error") {
            Swal.fire({ icon: 'error', title: 'Giriş Başarısız', text: result.message });
        } else {
            // Başarılı Giriş
            studentName = result.name;
            studentNumber = id;
            
            // Tam ekrana geçmeyi dene
            try { await openFullscreen(); } catch (e) { console.log("Tam ekran reddedildi"); }

            // Sınavı başlat
            setTimeout(() => {
                hasAttemptedFullscreen = true;
                initializeQuiz();
            }, 500);
            
            // Başarılı olursa butonu resetlemeye gerek yok, ekran değişecek
            return; 
        }

    } catch (e) {
        console.error(e);
        Swal.fire({ 
            icon: 'error', 
            title: 'Hata', 
            text: 'Sunucuya bağlanılamadı veya internet kesildi. Lütfen tekrar deneyin.' 
        });
    } finally {
        // Hata durumunda veya başarısız girişte butonu eski haline getir (DONMAYI ENGELLER)
        startBtn.disabled = false;
        startBtn.innerText = originalText;
    }
}

// -----------------------------------------------------
// SINAV MANTIĞI
// -----------------------------------------------------
function initializeQuiz() {
    if (!questionsSource || questionsSource.length === 0) {
        Swal.fire('Uyarı', 'Sistemde soru bulunamadı. Lütfen yönetici panelinden soru yükleyin.', 'warning');
        return;
    }

    isExamActive = true;
    const shuffledQuestions = shuffleArray([...questionsSource]);

    activeQuestions = shuffledQuestions.map(q => {
        const optionsWithIndex = (q.options || []).map((opt, idx) => ({ val: opt, originalIdx: idx }));
        const shuffledOptionsMap = shuffleArray(optionsWithIndex);
        const finalOptions = shuffledOptionsMap.map(o => o.val);

        let newAnswerIndex = "";
        if (q.type === 'text') {
            newAnswerIndex = q.answer;
        } else {
            const originalAnsStr = (q.answer !== undefined && q.answer !== null) ? q.answer.toString() : "";
            if(q.type === 'checkbox' && originalAnsStr.includes(',')) {
                newAnswerIndex = originalAnsStr; 
            } else {
                const found = shuffledOptionsMap.findIndex(o => o.originalIdx.toString() === originalAnsStr);
                newAnswerIndex = found !== -1 ? found : "";
            }
        }

        return {
            ...q,
            options: finalOptions,
            _secureAnswer: obfuscateAnswer(newAnswerIndex.toString()),
            topic: q.topic || "Genel",
            image: q.image || ""
        };
    });

    const savedData = localStorage.getItem(`exam_progress_${studentNumber}`);
if (savedData) {
    const parsed = JSON.parse(savedData);
    // Eğer soru sayısı değişmediyse eski cevapları yükle
    if (parsed.answers && parsed.answers.length === activeQuestions.length) {
        userAnswers = parsed.answers;
        Swal.fire({
            icon: 'info',
            title: 'Kaldığınız Yerden Devam',
            text: 'Önceki oturumunuzdan cevaplarınız yüklendi.',
            timer: 2000,
            showConfirmButton: false
        });
    } else {
        userAnswers = new Array(activeQuestions.length).fill(null);
    }
    
    // İtirazları da geri yükle
    if(parsed.objections) {
        userObjections = parsed.objections;
    }
} else {
    userAnswers = new Array(activeQuestions.length).fill(null);
}

// Navigasyon butonlarını ve görselleri hemen güncelle
setTimeout(() => {
    createNavButtons();
    updateNavVisuals();
}, 100);
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;
    currentQuestionIndex = 0;
    showQuestion(0);
    startExamTimer();
    

    createNavButtons(); // <-- YENİ: Butonları oluştur
    updateNavVisuals(); // <-- YENİ: İlk durumu boya
    startStudentHeartbeat();
}

function showQuestion(index) {
    const q = activeQuestions[index];
    const progress = ((index + 1) / activeQuestions.length) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('qIndex').innerText = `SORU ${index + 1} / ${activeQuestions.length}`;
    document.getElementById('qText').innerHTML = q.question;

    const imgEl = document.getElementById('qImage');
    if (q.image && q.image.startsWith('http')) { imgEl.src = q.image; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }

    renderOptions(q, index);

    const nextBtn = document.getElementById('nextBtn');
    if (index === activeQuestions.length - 1) {
        nextBtn.innerText = "Sınavı Bitir ✅";
        nextBtn.onclick = confirmFinishQuiz;
    } else {
        nextBtn.innerText = "Sonraki Soru ➡️";
        nextBtn.onclick = () => { currentQuestionIndex++; showQuestion(currentQuestionIndex); };
    }
    
    // İpucu
    const agentBox = document.getElementById('agentBox');
    agentBox.classList.add('hidden');
    if(hintTimeout) clearTimeout(hintTimeout);
    if(q.hint) {
        hintTimeout = setTimeout(() => {
            document.getElementById('agentText').innerText = q.hint;
            agentBox.classList.remove('hidden');
        }, 45000); // 45 Saniye sonra ipucu
    }
    
    if (window.MathJax) MathJax.typesetPromise([document.getElementById('quizScreen')]).catch(()=>{});
    updateFlagButtonColor();
    updateNavVisuals(); // <-- YENİ: Hangi sorudayız güncelle
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = "";
    const currentAns = userAnswers[index];

    // 1. Durum: Klasik Yazılı Cevap (Text)
    if (q.type === 'text') {
        const val = currentAns || '';
        div.innerHTML = `
            <div style="position:relative;">
                <textarea 
                    class="text-answer-input" 
                    rows="4" 
                    maxlength="500"
                    placeholder="Cevabınızı buraya yazınız..."
                    oninput="
                        this.nextElementSibling.innerText = this.value.length + '/500';
                        userAnswers[${index}]=this.value.trim(); 
                        updateNavVisuals(); 
                        saveProgressToLocal()
                    ">${val}</textarea>
                <span style="position:absolute; bottom:10px; right:10px; font-size:0.8rem; color:#9ca3af;">
                    ${val.length}/500
                </span>
            </div>`;
    
    // 2. Durum: Çoklu Seçim (Checkbox)
    } else if (q.type === 'checkbox') {
        let sel = currentAns ? JSON.parse(currentAns) : [];
        q.options.forEach((opt, i) => {
            const isChk = sel.includes(i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="checkbox" ${isChk?'checked':''}><span>${opt}</span>`;
            
            lbl.onclick = (e) => {
                if(e.target.tagName!=='INPUT') lbl.querySelector('input').click();
            };
            
            // BURAYA EKLENDİ: Checkbox değişince nav güncellensin
            lbl.querySelector('input').onchange = (e) => {
            if(e.target.checked) sel.push(i); else sel = sel.filter(x=>x!==i);
            userAnswers[index] = JSON.stringify(sel);
            renderOptions(q, index); 
            updateNavVisuals();
            saveProgressToLocal(); // <--- EKLENDİ
            };
            div.appendChild(lbl);
        });

    // 3. Durum: Tekli Seçim (Radio - Varsayılan)
    } else { 
        q.options.forEach((opt, i) => {
            const isChk = (currentAns !== null && parseInt(currentAns) === i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="radio" name="opt${index}" ${isChk?'checked':''}><span>${opt}</span>`;
            
            // BURAYA EKLENDİ: Şıkkı seçince nav güncellensin
            lbl.onclick = () => { 
            userAnswers[index] = i.toString(); 
            renderOptions(q, index);
            updateNavVisuals();
            saveProgressToLocal(); // <--- EKLENDİ
              };
            div.appendChild(lbl);
        });
    }
}

// -----------------------------------------------------
// ZAMANLAYICI & BİTİŞ
// -----------------------------------------------------
function startExamTimer() {
    totalTimeLeft = 30 * 60;
    examTimerInterval = setInterval(() => {
        if (totalTimeLeft <= 0) { finishQuiz("TIMEOUT"); return; }
        totalTimeLeft--;
        const m = Math.floor(totalTimeLeft/60);
        const s = totalTimeLeft%60;
        document.getElementById('timer').innerText = `${m}:${s<10?'0'+s:s}`;
    }, 1000);
}

function confirmFinishQuiz() {
    // Boş soruları say
    let bosSayisi = 0;
    activeQuestions.forEach((q, index) => {
        if (userAnswers[index] === null || userAnswers[index] === "") {
            bosSayisi++;
        }
    });

    let uyariMetni = "Sınavı bitirmek istediğinize emin misiniz?";
    let ikon = "question";

    if (bosSayisi > 0) {
        uyariMetni = `⚠️ DİKKAT: ${bosSayisi} soruyu BOŞ bıraktınız! Yine de bitirmek istiyor musunuz?`;
        ikon = "warning";
    }

    Swal.fire({
        title: 'Sınavı Bitir?',
        text: uyariMetni,
        icon: ikon,
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Evet, Bitir',
        cancelButtonText: 'Hayır, Kontrol Edeceğim'
    }).then((result) => {
        if (result.isConfirmed) {
            finishQuiz('NORMAL');
        }
    });
}

// script.js dosyasındaki finishQuiz fonksiyonunu tamamen bununla değiştir:

function finishQuiz(type) {
    if (!isExamActive) return;
    isExamActive = false; // Sınavı pasife çek (Böylece normal kalp atışı durur)
    
    clearInterval(examTimerInterval);
    if(hintTimeout) clearTimeout(hintTimeout);
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});

    let score = 0;
    const pts = 100 / activeQuestions.length;

    // Puanlama Mantığı
    activeQuestions.forEach((q, i) => {
        if(type.startsWith("CHEATING")) return;

        const correct = deobfuscateAnswer(q._secureAnswer);
        const user = userAnswers[i];
        let isOk = false;

        if (q.type === 'text') {
            isOk = (user && user.toLowerCase() === correct.toLowerCase());
        } else if (q.type === 'checkbox') {
             isOk = (user === correct); 
        } else {
            isOk = (user === correct);
        }

        if (isOk) score += pts;
    });

    score = Math.round(score);

    // Ekran Değişimi (Animasyonlu)
    document.getElementById('quizScreen').classList.add('hidden');
    const resultScreen = document.getElementById('resultScreen');
    resultScreen.classList.remove('hidden');
    
    const scoreCard = document.querySelector('.score-card');
    if(scoreCard) scoreCard.classList.add('score-pop-animation');

    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    // Durum Belirleme ve Feedback
    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    // --- SİNYAL GÖNDERME MANTIĞI ---
    if (type.startsWith("CHEATING")) {
        // 1. KOPYA DURUMU
        fb.innerHTML = "⚠️ KOPYA GİRİŞİMİ - SINAV İPTAL";
        fb.style.color = "red";
        statusNote = "KOPYA";

        // Hoca Paneline "KOPYA" sinyali gönder
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                type: "HEARTBEAT",
                Numara: studentNumber,
                Isim: studentName,
                Soru: currentQuestionIndex + 1,
                Kopya: "⚠️ KOPYA TESPİTİ",
                Itiraz: "-"
            })
        }).catch(err => console.log("Kopya sinyali hatası"));

    } else {
        // 2. NORMAL BİTİŞ DURUMU
        if (score >= 50) {
            fb.innerHTML = "Tebrikler! Geçtiniz 🎉";
            fb.style.color = "green";
            // Konfeti
             if (window.confetti) {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
        } else {
            fb.innerHTML = "Kaldınız.";
        }

        // Hoca Paneline "BİTTİ" sinyali gönder (BU KISIM EKSİKTİ)
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                type: "HEARTBEAT",
                Numara: studentNumber,
                Isim: studentName,
                Soru: "BİTTİ",
                Kopya: "🏁 TAMAMLANDI", // Bu metin paneli Yeşil yapar
                Itiraz: "-"
            })
        }).catch(err => console.log("Bitiş sinyali hatası"));
    }

    generateReviewPanel();

    // İtirazları Topla
    let itirazMetni = "";
    if (typeof userObjections !== 'undefined') {
        Object.keys(userObjections).forEach(key => {
            const soruNo = parseInt(key) + 1;
            itirazMetni += `[Soru ${soruNo}: ${userObjections[key]}] `;
        });
    }
    if(itirazMetni === "") itirazMetni = "-";

    // Sonucu Kaydet (Google Sheet)
    sendToGoogleSheets({
        type: "RESULT",
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote,
        Itirazlar: itirazMetni
    });
    
    // LocalStorage Temizliği
    localStorage.removeItem(`exam_progress_${studentNumber}`);
}

// -----------------------------------------------------
// CEVAP ANAHTARI & YÖNETİCİ PANELİ
// -----------------------------------------------------
function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        const correctIdx = deobfuscateAnswer(q._secureAnswer);
        const userIdx = userAnswers[i];
        
        let userDisp = "(Boş)", correctDisp = "";
        let isCorrect = false;

        if(q.type === 'text') {
            userDisp = userIdx || "(Boş)";
            correctDisp = correctIdx;
            isCorrect = (userDisp.toLowerCase() === correctDisp.toLowerCase());
        } else {
            userDisp = (userIdx !== null && q.options[userIdx]) ? q.options[userIdx] : "(Boş)";
            correctDisp = q.options[correctIdx] ? q.options[correctIdx] : "Hata";
            isCorrect = (userIdx === correctIdx);
        }

        const row = document.createElement('div');
        row.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;
        row.innerHTML = `<b>${i+1}. ${q.question}</b><br>Siz: ${userDisp}<br>Doğru: ${correctDisp}`;
        div.appendChild(row);
    });
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }

function sendToGoogleSheets(data) {
    fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(data) });
}

// --- YÖNETİCİ FONKSİYONLARI ---
function toggleAdmin() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
}

function closeAdmin() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
}

function adminLoginAttempt() {
    const p = document.getElementById('adminPass').value;
    if(p === "zeynep1605") {
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminControls').classList.remove('hidden');
        Swal.fire({toast:true, icon:'success', title:'Hoş geldin Yönetici', timer:1500, showConfirmButton:false});
    } else {
        Swal.fire('Hatalı Şifre');
    }
}

function uploadQuestions() {
    try {
        const json = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(json)) throw new Error();
        
        document.getElementById('adminStatus').innerText = "Yükleniyor...";
        
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "ADD_BULK", questions: json })
        })
        .then(r => r.json())
        .then(d => {
            if(d.status === 'success') document.getElementById('adminStatus').innerText = "Başarılı ✅";
            else document.getElementById('adminStatus').innerText = "Hata oluştu.";
        });
    } catch {
        Swal.fire('JSON Formatı Hatalı');
    }
}

function deleteQuestions() {
    if(!confirm("Tüm sorular silinsin mi?")) return;
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "DELETE_ALL" })
    }).then(() => Swal.fire('Silindi'));
}
function flagQuestion() {
    const qIndex = currentQuestionIndex; // O anki soru numarası
    
    // Daha önce itiraz ettiyse onu kutuya getir, yoksa boş gelsin
    const eskiItiraz = userObjections[qIndex] || "";

    Swal.fire({
        title: 'Soruya İtiraz Et',
        input: 'textarea',
        inputLabel: 'Bu sorudaki hata nedir?',
        inputValue: eskiItiraz,
        inputPlaceholder: 'Örn: Doğru şık seçeneklerde yok...',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal'
    }).then((result) => {
        // Kullanıcı "Kaydet"e bastıysa burası çalışır
        if (result.isConfirmed) {
            const mesaj = result.value;
            
            if (mesaj) {
                // Mesaj yazdıysa kaydet
                userObjections[qIndex] = mesaj;
                Swal.fire('Kaydedildi', 'İtirazınız iletildi.', 'success');
            } else {
                // Mesajı sildiyse itirazı kaldır
                delete userObjections[qIndex];
            }

            // --- İŞTE O KODLAR BURAYA GELİYOR ---
            // İtiraz durumuna göre hem butonu hem de üstteki topu boyuyoruz
            updateFlagButtonColor();
            updateNavVisuals(); 
            saveProgressToLocal();
        }
    });
}

function updateFlagButtonColor() {
    const btn = document.getElementById('flagBtn');
    // Eğer bu soruya itiraz edildiyse butonu kırmızı yap, yoksa turuncu kalsın
    if (userObjections[currentQuestionIndex]) {
        btn.style.background = "#ef4444"; // Kırmızı
        btn.innerText = "⚠️ İtiraz Edildi (Düzenle)";
    } else {
        btn.style.background = "#f59e0b"; // Turuncu
        btn.innerText = "⚠️ Bu Soruda Hata Var / İtiraz Et";
    }
}
// --- NAVİGASYON FONKSİYONLARI ---

// 1. Sınav Başlarken Butonları Oluştur
function createNavButtons() {
    const container = document.getElementById('questionNav');
    container.innerHTML = ""; // Temizle
    
    activeQuestions.forEach((q, index) => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.innerText = index + 1;
        btn.onclick = () => {
            currentQuestionIndex = index;
            showQuestion(index);
        };
        // Butona ID veriyoruz ki sonradan rengini değiştirebilelim
        btn.id = `navBtn-${index}`;
        container.appendChild(btn);
    });
}

// 2. Renkleri Güncelle (Her işlemden sonra çağıracağız)
function updateNavVisuals() {
    activeQuestions.forEach((q, index) => {
        const btn = document.getElementById(`navBtn-${index}`);
        if(!btn) return;

        // Önce tüm sınıfları temizle, sadece base class kalsın
        btn.className = 'nav-btn';

        // 1. Durum: İşaretlenmiş mi?
        if (userAnswers[index] !== null && userAnswers[index] !== "") {
            btn.classList.add('answered');
        }

        // 2. Durum: İtiraz var mı? (İşaretli olsa bile İtiraz rengi baskın çıkar)
        if (userObjections && userObjections[index]) {
            btn.classList.add('flagged');
        }

        // 3. Durum: Şu an bu soruda mıyız?
        if (index === currentQuestionIndex) {
            btn.classList.add('active');
        }
    });
}
function saveProgressToLocal() {
    if (!isExamActive || !studentNumber) return;

    const dataToSave = {
        answers: userAnswers,
        objections: userObjections,
        timestamp: new Date().getTime()
    };
    
    // Öğrenci numarasına özel kayıt açıyoruz ki başkasıyla karışmasın
    localStorage.setItem(`exam_progress_${studentNumber}`, JSON.stringify(dataToSave));
}
function startStudentHeartbeat() {
    // Sadece sınav aktifse gönder
    setInterval(() => {
        if (!isExamActive || !studentNumber) return;

        // İtiraz var mı kontrol et
        const activeObjection = userObjections[currentQuestionIndex] ? "VAR" : "-";
        
        // Kopya durumu kontrolü (daha önce belirlenmiş bir değişken var mı?)
        // Basitçe aktif mi değil mi onu yolluyoruz.
        const cheatStatus = document.hidden ? "Sekme Arkada!" : "Temiz";

        const payload = {
            type: "HEARTBEAT",
            Numara: studentNumber,
            Isim: studentName,
            Soru: (currentQuestionIndex + 1),
            Kopya: cheatStatus,
            Itiraz: activeObjection
        };

        // Arka planda sessizce gönder (await kullanma ki donmasın)
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        }).catch(e => console.log("Heartbeat fail")); // Hata olursa öğrenciye hissettirme

    }, 15000); // 15 Saniyede bir güncelle
}
let adminMonitorInterval = null;

function showAdminTab(tabName) {
    document.getElementById('tab-monitor').classList.add('hidden');
    document.getElementById('tab-questions').classList.add('hidden');
    
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

function startAdminMonitor() {
    Swal.fire({
        toast: true,
        icon: 'info',
        title: 'Canlı İzleme Başlatıldı',
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
    });

    fetchLiveTable(); // İlk veriyi hemen çek
    
    // Varsa eski döngüyü temizle
    if (adminMonitorInterval) clearInterval(adminMonitorInterval);

    // 10 Saniyede bir tabloyu yenile
    adminMonitorInterval = setInterval(fetchLiveTable, 10000);
}

function fetchLiveTable() {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "GET_ADMIN_LIVE" })
    })
    .then(r => r.json())
    .then(rows => {
        const tbody = document.getElementById('liveTableBody');
        tbody.innerHTML = ""; // Tabloyu temizle

        if (rows.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:15px;'>Aktif öğrenci yok.</td></tr>";
            return;
        }

        rows.forEach(row => {
            // Row yapısı: [Numara, İsim, Zaman, SoruNo, Kopya, İtiraz]
            const [num, isim, zaman, soru, kopya, itiraz] = row;
            
            // Kopya şüphesi varsa satırı kırmızı yap
            // --- RENKLENDİRME MANTIĞI (GÜNCELLENDİ) ---
            let rowStyle = "border-bottom:1px solid #eee;"; // Varsayılan (Beyaz/Gri)
            let durumIkon = "🟢 Aktif";

            if (kopya.includes("KOPYA") || kopya.includes("DİKKAT")) {
                // KOPYA DURUMU (KIRMIZI)
                rowStyle = "background:#fee2e2; color:#b91c1c; font-weight:bold;";
                durumIkon = "⚠️ DİKKAT";
            } 
            else if (kopya.includes("TAMAMLANDI")) {
                // BİTİRME DURUMU (YEŞİL/MAVİ)
                rowStyle = "background:#ecfdf5; color:#047857; font-weight:bold;"; // Açık yeşil zemin, koyu yeşil yazı
                durumIkon = "🏁 BİTTİ";
            }
            // -------------------------------------------
            
            const tr = document.createElement('tr');
            tr.style = rowStyle;
            tr.innerHTML = `
                <td style="padding:8px;">${num}</td>
                <td style="padding:8px;">${isim}</td>
                <td style="padding:8px;">${durumIkon}</td>
                <td style="padding:8px; text-align:center;">${soru === "BİTTİ" ? "-" : soru + ". Soru"}</td>
                <td style="padding:8px; text-align:center;">${itiraz !== "-" ? "🚩 VAR" : "-"}</td>
            `;
            // Son aktiflik zamanına göre "Online/Offline" kararı (Basit mantık)
            // (Apps Script zamanı metin gönderdiği için burada basit ikon kullanacağız)
            
            tbody.appendChild(tr);
        });
    })
    .catch(err => console.error("Admin Monitor Error:", err));
}