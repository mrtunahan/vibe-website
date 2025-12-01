// ==================================================================
// ⚠️ DİKKAT: BURADAKİ URL SİZİN KENDİ APPSCRIPT URL'NİZ OLMALI
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwvhNX1Z2XwVLsKn6RCPwRFNULRWM-GRYkwdiot4t6mq9ZlDEb7mHV6baHea8XDpvCL/exec';

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
let studentHeartbeatInterval = null; // Kalp atışını durdurmak için bu değişken şart

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
    fetch(GOOGLE_SCRIPT_URL + "?v=" + new Date().getTime()) 
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

            // Bekleme odasına al
            setTimeout(() => {
                hasAttemptedFullscreen = true;
                waitForTeacher(); // <--- YENİ FONKSİYON
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
// script.js dosyasındaki initializeQuiz fonksiyonunu bununla değiştirin:

function initializeQuiz() {
    if (!questionsSource || questionsSource.length === 0) {
        Swal.fire('Uyarı', 'Sistemde soru bulunamadı. Lütfen yönetici panelinden soru yükleyin.', 'warning');
        return;
    }

    isExamActive = true;
    
    // --- 1. ORİJİNAL SIRAYI KAYDET ---
    // Soruları karıştırmadan önce, her birinin Excel'deki sırasını (i) içine kaydediyoruz.
    const questionsWithIndex = questionsSource.map((q, i) => {
        return { ...q, originalIndex: i };
    });

    // --- 2. KARIŞTIRMAYI AÇ ---
    // Artık güvenle karıştırabiliriz, çünkü kimlikleri (originalIndex) üzerinde.
    const shuffledQuestions = shuffleArray([...questionsWithIndex]);

    activeQuestions = shuffledQuestions.map(q => {
        // Şıkları karıştırma mantığı (Değişmedi)
        const optionsWithIndex = (q.options || []).map((opt, idx) => ({ val: opt, originalIdx: idx }));
        // İsterseniz şıkları da karıştırabilirsiniz, burada orijinal sırayı koruyoruz:
        const finalOptions = q.options; 

        // Cevap İndeksini Bul
        let newAnswerIndex = -1;
        const excelAnswer = (q.answer || "").toString().trim();

        if (q.type === 'text') {
            newAnswerIndex = excelAnswer;
        } else {
            // Excel'de cevap "1" (B) ise -> Yazılımda 1 (B)
            // Excel'de cevap "2" (C) ise -> Yazılımda 2 (C)
            // (normalizeAnswer fonksiyonu backend'de zaten -1 işlemini yapıyor, burada düz alabiliriz)
            if (!isNaN(excelAnswer)) {
                newAnswerIndex = parseInt(excelAnswer) - 1; 
            } else {
                const harf = excelAnswer.toLowerCase();
                if(harf === 'a') newAnswerIndex = 0;
                if(harf === 'b') newAnswerIndex = 1;
                if(harf === 'c') newAnswerIndex = 2;
                if(harf === 'd') newAnswerIndex = 3;
                if(harf === 'e') newAnswerIndex = 4;
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

    // LocalStorage işlemleri
    const savedData = localStorage.getItem(`exam_progress_${studentNumber}`);
    if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.answers && parsed.answers.length === activeQuestions.length) {
            userAnswers = parsed.answers;
        } else {
            userAnswers = new Array(activeQuestions.length).fill(null);
        }
        if(parsed.objections) userObjections = parsed.objections;
    } else {
        userAnswers = new Array(activeQuestions.length).fill(null);
    }

    setTimeout(() => { createNavButtons(); updateNavVisuals(); }, 100);
    
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;
    currentQuestionIndex = 0;
    showQuestion(0);
    startExamTimer();
    createNavButtons();
    updateNavVisuals();
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

    // ============================================================
    // 👇 BURASI DEĞİŞTİ (Senin verdiğin yeni kod bloğu) 👇
    // ============================================================
    
    // 1. Durum: Klasik Yazılı Cevap (GELİŞMİŞ MOD: TEXT | DRAW | CODE)
    if (q.type === 'text') {
        const val = currentAns || '';
        let initialMode = 'text';
        
        // Eğer daha önce çizim yapılmışsa modu 'draw' yap
        if(val.startsWith('[DRAW]')) initialMode = 'draw';
        
        div.innerHTML = `
            <div class="tools-container">
                <div class="tool-btn ${initialMode==='text'?'active':''}" onclick="switchTool(${index}, 'text', this)">📝 Metin</div>
                <div class="tool-btn ${initialMode==='draw'?'active':''}" onclick="switchTool(${index}, 'draw', this)">🎨 Çizim</div>
                <div class="tool-btn ${initialMode==='code'?'active':''}" onclick="switchTool(${index}, 'code', this)">💻 Kod</div>
            </div>

            <div id="box-text-${index}" class="${initialMode==='text'?'':'hidden'}">
                 <textarea 
                    class="text-answer-input" 
                    rows="8" 
                    placeholder="Cevabınızı buraya yazınız..."
                    oninput="userAnswers[${index}]=this.value; updateNavVisuals(); saveProgressToLocal()"
                >${val.startsWith('[DRAW]') ? '' : val}</textarea>
            </div>

            <div id="box-draw-${index}" class="canvas-wrapper ${initialMode==='draw'?'':'hidden'}">
                <canvas id="canvas-${index}" style="width:100%; height:300px;"></canvas>
                <div class="canvas-toolbar">
                    <button class="canvas-btn" onclick="clearCanvas('canvas-${index}', ${index})">🗑️ Temizle</button>
                </div>
            </div>

            <div id="box-code-${index}" class="code-editor-wrapper ${initialMode==='code'?'':'hidden'}">
                <div class="code-header"><span>main.js</span> <span>JavaScript</span></div>
                <textarea 
                    class="code-input" 
                    rows="10" 
                    spellcheck="false"
                    placeholder="// Kodunuzu buraya yazın..."
                    oninput="userAnswers[${index}]=this.value; updateNavVisuals(); saveProgressToLocal()"
                    onkeydown="if(event.key==='Tab'){event.preventDefault();this.setRangeText('    ',this.selectionStart,this.selectionStart,'end')}"
                >${val.startsWith('[DRAW]') ? '' : val}</textarea>
            </div>
        `;

        // Eğer başlangıç modu çizim ise canvas'ı hemen başlat
        if(initialMode === 'draw') {
             setTimeout(() => initCanvas(`canvas-${index}`, index), 100);
        }
    
    // ============================================================
    // 👆 YENİ KOD BİTİŞİ 👆
    // ============================================================

    // 2. Durum: Çoklu Seçim (Checkbox) - (ESKİSİ GİBİ KALSIN)
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
            
            lbl.querySelector('input').onchange = (e) => {
            if(e.target.checked) sel.push(i); else sel = sel.filter(x=>x!==i);
            userAnswers[index] = JSON.stringify(sel);
            renderOptions(q, index); 
            updateNavVisuals();
            saveProgressToLocal();
            };
            div.appendChild(lbl);
        });

    // 3. Durum: Tekli Seçim (Radio) - (ESKİSİ GİBİ KALSIN)
    } else { 
        q.options.forEach((opt, i) => {
            const isChk = (currentAns !== null && parseInt(currentAns) === i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="radio" name="opt${index}" ${isChk?'checked':''}><span>${opt}</span>`;
            
            lbl.onclick = () => { 
            userAnswers[index] = i.toString(); 
            renderOptions(q, index);
            updateNavVisuals();
            saveProgressToLocal(); 
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

// script.js dosyasındaki finishQuiz fonksiyonunu tamamen bununla değiştirin:

// script.js dosyasındaki finishQuiz fonksiyonunu bununla değiştirin:

function finishQuiz(type) {
    if (!isExamActive) return;
    isExamActive = false;
    
    clearInterval(examTimerInterval);
    if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);
    if(hintTimeout) clearTimeout(hintTimeout);
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});

    let correctCount = 0;
    
    // --- PUANLAMA ---
    activeQuestions.forEach((q, i) => {
        if(type.startsWith("CHEATING")) return;

        const correctVal = deobfuscateAnswer(q._secureAnswer);
        const userVal = userAnswers[i];
        
        let isOk = false;
        if (userVal !== null && userVal !== undefined && correctVal !== null && correctVal !== undefined) {
            const uStr = userVal.toString().trim().toLowerCase();
            const cStr = correctVal.toString().trim().toLowerCase();
            
            if (uStr === cStr) {
                isOk = true;
            }
        }
        if (isOk) correctCount++;
    });

    // Puan Hesabı
    let totalQuestions = activeQuestions.length;
    let score = 0;
    if (totalQuestions > 0) {
        score = Math.round((correctCount / totalQuestions) * 100);
    }

    // Ekran Değişimi
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    if (type.startsWith("CHEATING")) {
        fb.innerHTML = "⚠️ KOPYA GİRİŞİMİ - SINAV İPTAL";
        fb.style.color = "red";
        statusNote = "KOPYA";
        // Kopya Sinyali...
        fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "HEARTBEAT", Numara: studentNumber, Isim: studentName, Soru: currentQuestionIndex + 1, Kopya: "⚠️ KOPYA TESPİTİ", Itiraz: "-" }) }).catch(()=>{});
    } else {
        if (score >= 50) {
            fb.innerHTML = "Tebrikler! Geçtiniz 🎉";
            fb.style.color = "green";
            if (window.confetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        } else {
            fb.innerHTML = "Kaldınız.";
            fb.style.color = "red";
        }
        // Bitiş Sinyali
        fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "HEARTBEAT", Numara: studentNumber, Isim: studentName, Soru: "BİTTİ", Kopya: "TAMAMLANDI", Itiraz: "-" }) }).catch(()=>{});
    }

    generateReviewPanel();

    let itirazMetni = "";
    if (typeof userObjections !== 'undefined') {
        Object.keys(userObjections).forEach(key => {
            const soruNo = parseInt(key) + 1;
            itirazMetni += `[Soru ${soruNo}: ${userObjections[key]}] `;
        });
    }
    if(itirazMetni === "") itirazMetni = "-";

    // --- KARIŞIKLIĞI DÜZELTME (RE-ORDERING) ---
    // Öğrenci cevapları şu an karışık sırada (userAnswers).
    // Bunları Excel'deki orijinal sıraya (originalIndex) göre yeniden dizmeliyiz.
    
    const sortedAnswers = new Array(activeQuestions.length).fill("");
    
    activeQuestions.forEach((q, index) => {
        // q.originalIndex: Bu sorunun Excel'deki gerçek sıra numarası
        // index: Şu an sınavdaki karışık sıra numarası
        // userAnswers[index]: Öğrencinin bu soruya verdiği cevap
        
        if (q.originalIndex !== undefined) {
            sortedAnswers[q.originalIndex] = userAnswers[index];
        } else {
            // Eğer indeks bulunamazsa olduğu gibi koy (Yedek plan)
            sortedAnswers[index] = userAnswers[index];
        }
    });

    // SONUCU KAYDET (Artık 'userAnswers' yerine 'sortedAnswers' gönderiyoruz)
    sendToGoogleSheets({
        type: "RESULT",
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote,
        Itirazlar: itirazMetni,
        Cevaplar: sortedAnswers // <-- DÜZELTİLMİŞ SIRALI LİSTE
    });
    
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



function closeAdmin() {
    
    location.reload(); 
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
function startStudentHeartbeat(isWaiting = false) {
    if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);

    studentHeartbeatInterval = setInterval(() => {
        // Numara yoksa dur
        if (!studentNumber) return;

        // Durum Belirleme
        let cheatStatus = "Temiz";
        let soruDurumu = isWaiting ? "⏳ Bekliyor" : (currentQuestionIndex + 1);

        if (!isWaiting) {
            // Sınavdaysa kopya kontrolü yap
            if (!isExamActive) return; // Sınav bitmişse gönderme
            cheatStatus = document.hidden ? "Sekme Arkada!" : "Temiz";
        } else {
            // Bekleme odasındaysa
            cheatStatus = "Hazır"; 
        }

        const activeObjection = (userObjections && userObjections[currentQuestionIndex]) ? "VAR" : "-";

        const payload = {
            type: "HEARTBEAT",
            Numara: studentNumber,
            Isim: studentName,
            Soru: soruDurumu,
            Kopya: cheatStatus,
            Itiraz: isWaiting ? "-" : activeObjection
        };

        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        }).catch(e => console.log("Heartbeat fail"));

    }, isWaiting ? 5000 : 15000); // Beklerken 5sn, sınavda 15sn
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

        // --- İSTATİSTİK SAYAÇLARI (YENİ) ---
        let countActive = 0;
        let countFinished = 0;
        let countRisk = 0;

        if (rows.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:15px;'>Aktif öğrenci yok.</td></tr>";
            updateStats(0, 0, 0); // Sıfırla
            return;
        }

        rows.forEach(row => {
            // Row yapısı: [Numara, İsim, Zaman, SoruNo, Kopya, İtiraz]
            const [num, isim, zaman, soru, kopya, itiraz] = row;
            
            let rowStyle = "border-bottom:1px solid #eee;";
            let durumIkon = "🟢 Aktif";

            // Durum Analizi ve Sayım
            if (kopya.includes("KOPYA") || kopya.includes("DİKKAT")) {
                rowStyle = "background:#fee2e2; color:#b91c1c; font-weight:bold;";
                durumIkon = "⚠️ RİSK";
                countRisk++;
            } 
            else if (kopya.includes("TAMAMLANDI") || soru === "BİTTİ") {
                rowStyle = "background:#ecfdf5; color:#047857; font-weight:bold;";
                durumIkon = "🏁 BİTTİ";
                countFinished++;
            } else {
                // Normal Aktif
                countActive++;
            }
            
            const tr = document.createElement('tr');
            tr.style = rowStyle;
            // Arama fonksiyonu için class ekliyoruz
            tr.className = "student-row"; 
            tr.style = rowStyle;
            tr.className = "student-row";

            // 👇 BU SATIRI EKLEYİN (Tıklanınca Detay Aç)
            tr.onclick = () => openStudentDetail(num, isim);
            tr.style.cursor = "pointer"; // Mouse el işareti olsun
            tr.innerHTML = `
                <td style="padding:8px;">${num}</td>
                <td style="padding:8px; font-weight:500;">${isim}</td>
                <td style="padding:8px;">${durumIkon}</td>
                <td style="padding:8px; text-align:center;">${soru === "BİTTİ" ? "Tamamlandı" : soru}</td>
                <td style="padding:8px; text-align:center;">${itiraz !== "-" ? "🚩 VAR" : "-"}</td>
            `;
            tbody.appendChild(tr);
        });

        // İstatistikleri Güncelle
        updateStats(countActive, countFinished, countRisk);
        
        // Eğer arama kutusunda yazı varsa filtrelemeyi tekrar uygula (Tablo yenilenince filtre bozulmasın)
        filterAdminTable();
    })
    .catch(err => console.error("Admin Monitor Error:", err));
}

// --- YENİ YARDIMCI FONKSİYONLAR ---

// 1. İstatistikleri Ekrana Yazar
function updateStats(active, finished, risk) {
    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-finished').innerText = finished;
    document.getElementById('stat-risk').innerText = risk;
}

// 2. Tabloda Arama Yapar
function filterAdminTable() {
    const input = document.getElementById("adminSearch");
    const filter = input.value.toUpperCase();
    const rows = document.getElementsByClassName("student-row");

    for (let i = 0; i < rows.length; i++) {
        // İsim (2. sütun) ve Numara (1. sütun) içinde ara
        const numCol = rows[i].getElementsByTagName("td")[0];
        const nameCol = rows[i].getElementsByTagName("td")[1];
        
        if (numCol || nameCol) {
            const numText = numCol.textContent || numCol.innerText;
            const nameText = nameCol.textContent || nameCol.innerText;
            
            if (numText.toUpperCase().indexOf(filter) > -1 || nameText.toUpperCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }       
    }
}

// 3. Tabloyu Excel (CSV) Olarak İndirir
function exportTableToCSV(filename) {
    const csv = [];
    const rows = document.querySelectorAll("#monitorTable tr");
    
    // Sadece görünür satırları al (Filtreleme varsa ona uyar)
    for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll("td, th");
        
        // Eğer satır gizliyse (arama yapılmışsa) CSV'ye ekleme
        if(rows[i].style.display === 'none') continue;

        for (let j = 0; j < cols.length; j++) 
            row.push('"' + cols[j].innerText + '"'); // Tırnak içine al ki CSV bozulmasın
        
        csv.push(row.join(","));        
    }

    // Dosyayı oluştur ve indir
    const csvFile = new Blob([csv.join("\n")], {type: "text/csv"});
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
}
// --- Sınav Başlatma Kontrolü ---

let pollInterval = null;

function waitForTeacher() {
    // Ekranları değiştir
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('waitingScreen').classList.remove('hidden');
    document.getElementById('waitName').innerText = studentName;

    // 1. Kalp atışını "Bekliyor" moduyla başlat (Hoca görsün)
    startStudentHeartbeat(true); 

    // 2. Sürekli sunucuyu kontrol et (Sınav başladı mı?)
    pollInterval = setInterval(checkExamStatus, 3000); // 3 saniyede bir sor
}

function checkExamStatus() {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "CHECK_EXAM_STATUS" })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === "STARTED") {
            // Sınav Başladı!
            clearInterval(pollInterval); // Sormayı bırak
            document.getElementById('waitingScreen').classList.add('hidden');
            
            // Sınavı gerçekten başlat
            // startStudentHeartbeat'i sınav moduna geçirmek için kapatıp açıyoruz
            if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);
            
            initializeQuiz(); // Sınav ekranını kur
        }
    })
    .catch(e => console.log("Status check fail"));
}


// Hoca Paneli Buton Fonksiyonu
function toggleGlobalExam(status) {
    const btnStart = document.getElementById('globalStartBtn');
    
    // Kullanıcıya bilgi ver
    const msg = status === 'STARTED' ? "Sınav BAŞLATILIYOR..." : "Sınav DURDURULUYOR...";
    Swal.fire({
        toast: true, icon: 'info', title: msg, timer: 1500, showConfirmButton: false
    });

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "SET_EXAM_STATUS", status: status })
    })
    .then(r => r.json())
    .then(data => {
        if(data.status === 'success') {
            Swal.fire({
                toast: true,
                icon: status === 'STARTED' ? 'success' : 'warning',
                title: status === 'STARTED' ? "Sınav Başladı! 🚀" : "Sınav Durduruldu ⛔",
                timer: 3000,
                showConfirmButton: false
            });
        }
    })
    .catch(e => {
        console.error(e);
        Swal.fire('Hata', 'Sunucuyla iletişim kurulamadı.', 'error');
    });
}
// --- ÇİZİM (CANVAS) ALTYAPISI ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;

function initCanvas(canvasId, index) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Canvas Boyutunu Ayarla
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 300; // Yükseklik sabit
    
    // Kalem Ayarları
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault(); // Sayfa kaymasını engelle
        
        let clientX, clientY;
        if(e.type.includes('touch')) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        [lastX, lastY] = [x, y];
    }

    // Event Listeners (Mouse & Touch)
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        [lastX, lastY] = [e.clientX - rect.left, e.clientY - rect.top];
    });
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', () => { isDrawing = false; saveCanvas(index, canvas); });
    canvas.addEventListener('mouseout', () => isDrawing = false);

    // Mobil Uyumluluk
    canvas.addEventListener('touchstart', (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        [lastX, lastY] = [e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top];
    }, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', () => { isDrawing = false; saveCanvas(index, canvas); });
}

function clearCanvas(id, index) {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    userAnswers[index] = ""; // Veriyi temizle
    saveProgressToLocal();
    updateNavVisuals();
}

function saveCanvas(index, canvas) {
    // Çizimi Resim (Base64) formatında kaydet
    // Başına [DRAW] etiketi koyuyoruz ki raporlarken resim olduğunu anlayalım
    userAnswers[index] = "[DRAW]" + canvas.toDataURL(); 
    saveProgressToLocal();
    updateNavVisuals();
}
// Araçlar Arası Geçiş (Text <-> Draw <-> Code)
function switchTool(index, mode, btn) {
    // 1. Butonların aktifliğini değiştir
    const container = btn.parentElement;
    Array.from(container.children).forEach(c => c.classList.remove('active'));
    btn.classList.add('active');

    // 2. Kutuları gizle/göster
    document.getElementById(`box-text-${index}`).classList.add('hidden');
    document.getElementById(`box-draw-${index}`).classList.add('hidden');
    document.getElementById(`box-code-${index}`).classList.add('hidden');

    const targetBox = document.getElementById(`box-${mode}-${index}`);
    targetBox.classList.remove('hidden');

    // 3. Özel Durumlar
    if (mode === 'draw') {
        // Canvas'ı başlat (Gecikmeli başlat ki boyutu doğru algılasın)
        setTimeout(() => initCanvas(`canvas-${index}`, index), 50);
        
        // Eğer metin varsa ve çizime geçildiyse uyarı verilebilir
        // Şimdilik çizim moduna geçince veriyi sıfırlıyoruz veya kullanıcı çizince sıfırlanır
    } else {
        // Text veya Code moduna geçince, eğer cevap [DRAW] ise temizle
        if (userAnswers[index] && userAnswers[index].startsWith('[DRAW]')) {
             userAnswers[index] = ""; // Çizimden metne dönünce sıfırla
        }
        // İlgili kutudaki değeri userAnswers'a ata (Eski metni geri getirmiyoruz, basit tutuyoruz)
        const input = targetBox.querySelector('textarea');
        if(input) {
            userAnswers[index] = input.value;
            saveProgressToLocal();
        }
    }
}
// --- KARŞILAMA EKRANI YÖNETİMİ ---
function selectRole(role) {
    const landing = document.getElementById('landingPage');
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');

    // Opaklığı düşür
    landing.style.opacity = '0';
    
    // CSS transition süresi (0.4s) bittikten sonra gizle
    setTimeout(() => {
        landing.classList.add('hidden'); // display: none ekler
        landing.style.display = 'none'; // Garanti olsun diye inline stil de ekleyelim
        
        if (role === 'student') {
            loginScreen.classList.remove('hidden');
        } else if (role === 'teacher') {
            adminPanel.classList.remove('hidden');
            document.getElementById('adminLogin').classList.remove('hidden');
            document.getElementById('adminControls').classList.add('hidden');
        }
    }, 400); 
}
/* --- ÖĞRENCİ DETAY FONKSİYONLARI --- */

function openStudentDetail(numara, isim) {
    const modal = document.getElementById('studentDetailModal');
    const title = document.getElementById('detailModalTitle');
    const loading = document.getElementById('detailLoading');
    const body = document.getElementById('detailBody');

    // Modalı aç ve yükleniyor göster
    modal.classList.remove('hidden');
    title.innerText = `${isim} (${numara})`;
    loading.classList.remove('hidden');
    body.classList.add('hidden');

    // Backend'den veri iste
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "GET_STUDENT_DETAILS", Numara: numara })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === "error") {
            loading.innerText = "Veri alınamadı: " + data.message;
            return;
        }
        renderDetailView(data);
        loading.classList.add('hidden');
        body.classList.remove('hidden');
    })
    .catch(err => {
        console.error(err);
        loading.innerText = "Bağlantı Hatası!";
    });
}

function closeStudentDetail() {
    document.getElementById('studentDetailModal').classList.add('hidden');
}

function renderDetailView(data) {
    // İstatistikleri Doldur
    document.getElementById('d-correct').innerText = data.stats.correct;
    document.getElementById('d-wrong').innerText = data.stats.wrong;
    document.getElementById('d-empty').innerText = data.stats.empty;
    document.getElementById('d-score').innerText = data.stats.score;

    // Listeyi Oluştur
    const list = document.getElementById('detailAnswerList');
    list.innerHTML = "";

    data.answers.forEach((ans, index) => {
        // Renk ve Etiket Belirle
        let tagClass = "tag-wrong";
        let tagText = "YANLIŞ";
        let icon = "❌";

        if (ans.isCorrect) {
            tagClass = "tag-correct"; tagText = "DOĞRU"; icon = "✅";
        } else if (ans.userAnswer === "" || ans.userAnswer === null) {
            tagClass = ""; tagText = "BOŞ"; icon = "⭕";
        }

        const div = document.createElement('div');
        div.className = "detail-item";
        div.innerHTML = `
            <div style="font-weight:600; margin-bottom:4px;">
                ${index + 1}. Soru <span class="ans-tag ${tagClass}">${tagText}</span>
            </div>
            <div style="color:#666; font-size:0.85rem;">
                Siz: <b>${ans.userAnswer || "(Boş)"}</b> 
                ${!ans.isCorrect ? `| Doğru: <b>${ans.correctAnswer}</b>` : ""}
            </div>
        `;
        list.appendChild(div);
    });
}