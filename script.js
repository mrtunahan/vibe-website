// ==================================================================
// ⚠️ DİKKAT: BURADAKİ URL SİZİN KENDİ APPSCRIPT URL'NİZ OLMALI
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjoa_UjzaHpn7iQ1PrZRFSFVGiMyd-YuhJMYV-y2qEOWcgWhv_UIl3QX8lN1DiIxxT/exec';

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
let userObjections = {}; 
let studentHeartbeatInterval = null; 

// -----------------------------------------------------
// 1. GLOBAL FONKSİYONLAR (Tema & Admin)
// -----------------------------------------------------
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleAdmin() {
    const panel = document.getElementById('adminPanel');
    if(panel) {
        document.getElementById('loginScreen').classList.add('hidden'); 
        document.getElementById('waitingScreen').classList.add('hidden'); 
        panel.classList.remove('hidden'); 
    }
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
        Swal.fire({toast:true, icon:'success', title:'Giriş Başarılı', timer:1500, showConfirmButton:false});
    } else {
        Swal.fire({icon:'error', title:'Hatalı Şifre'});
    }
}

// -----------------------------------------------------
// 2. BAŞLANGIÇ & EVENT LISTENERLAR
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    const startBtn = document.getElementById('startBtn');
    const studentIdInput = document.getElementById('studentId');
    
    // Soruları Çek
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

    // Otomatik İsim Getirme
    studentIdInput.addEventListener('input', async function() {
        const numara = this.value.trim();
        const nameDisplay = document.getElementById('studentNameDisplay');

        if(numara.length === 9) {
            nameDisplay.value = "Aranıyor...";
            nameDisplay.style.color = "#4F46E5"; 

            try {
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST",
                    body: JSON.stringify({ type: "CHECK_ACCESS", Numara: numara })
                });
                
                const result = await response.json();
                if(result.status === "success" && result.name) {
                    nameDisplay.value = result.name;
                    nameDisplay.style.color = "green"; 
                    studentName = result.name; 
                } else {
                    nameDisplay.value = result.message || "Kayıt Bulunamadı";
                    nameDisplay.style.color = "red";
                }
            } catch (error) {
                nameDisplay.value = "Bağlantı Hatası!";
            }
        } else {
            if(numara.length < 9) nameDisplay.value = ""; 
        }
    });

    // Güvenlik önlemleri
    document.addEventListener("visibilitychange", () => { if(document.hidden && isExamActive) finishQuiz("CHEATING_TAB"); });
    document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && isExamActive && hasAttemptedFullscreen) finishQuiz("CHEATING_ESC"); });
    document.onkeydown = function (e) { if (e.keyCode === 123 || (e.ctrlKey && e.keyCode === 85)) return false; };
});

// -----------------------------------------------------
// 3. GİRİŞ VE BAŞLATMA
// -----------------------------------------------------
function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) return elem.requestFullscreen();
    if (elem.webkitRequestFullscreen) return elem.webkitRequestFullscreen();
    return Promise.resolve();
}

async function startQuizAttempt() {
    const idInput = document.getElementById('studentId');
    const startBtn = document.getElementById('startBtn');
    const id = idInput.value.toString().trim();

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

        if (result.status === "error") {
            Swal.fire({ icon: 'error', title: 'Giriş Başarısız', text: result.message });
        } else {
            studentName = result.name;
            studentNumber = id;
            try { await openFullscreen(); } catch (e) { console.log("Tam ekran reddedildi"); }

            // Bekleme odasına al
            setTimeout(() => {
                hasAttemptedFullscreen = true;
                waitForTeacher();
            }, 500);
            return; 
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'Hata', text: 'Sunucuya bağlanılamadı.' });
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = originalText;
    }
}

// -----------------------------------------------------
// 4. BEKLEME VE BAŞLATMA KONTROLÜ
// -----------------------------------------------------
let pollInterval = null;

function waitForTeacher() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('waitingScreen').classList.remove('hidden');
    document.getElementById('waitName').innerText = studentName;

    startStudentHeartbeat(true); 
    pollInterval = setInterval(checkExamStatus, 3000);
}

function checkExamStatus() {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ type: "CHECK_EXAM_STATUS" })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === "STARTED") {
            clearInterval(pollInterval);
            document.getElementById('waitingScreen').classList.add('hidden');
            if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);
            initializeQuiz(); 
        }
    })
    .catch(e => console.log("Status check fail"));
}

// -----------------------------------------------------
// 5. SINAV MANTIĞI
// -----------------------------------------------------
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
function obfuscateAnswer(answer) { try { return btoa(encodeURIComponent(answer)).split("").reverse().join(""); } catch (e) { return answer; } }
function deobfuscateAnswer(obf) { try { return decodeURIComponent(atob(obf.split("").reverse().join(""))); } catch (e) { return obf; } }

function initializeQuiz() {
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

    // LocalStorage Kontrolü
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
        }, 45000); 
    }
    
    if (window.MathJax) MathJax.typesetPromise([document.getElementById('quizScreen')]).catch(()=>{});
    updateFlagButtonColor();
    updateNavVisuals();
}

function renderOptions(q, index) {
    const div = document.getElementById('qOptions');
    div.innerHTML = "";
    const currentAns = userAnswers[index];

    // 1. Durum: Klasik Yazılı Cevap (SIDEBARLI)
    if (q.type === 'text') {
        const val = currentAns || '';
        let initialMode = 'text';
        if(val.startsWith('[DRAW]')) initialMode = 'draw';
        
        div.innerHTML = `
            <div class="tools-container">
                <div class="tool-btn ${initialMode==='text'?'active':''}" onclick="switchTool(${index}, 'text', this)">📝 Metin</div>
                <div class="tool-btn ${initialMode==='draw'?'active':''}" onclick="switchTool(${index}, 'draw', this)">🎨 Çizim</div>
                <div class="tool-btn ${initialMode==='code'?'active':''}" onclick="switchTool(${index}, 'code', this)">💻 Kod</div>
            </div>

            <div id="box-text-${index}" class="${initialMode==='text'?'':'hidden'}">
                 <textarea class="text-answer-input" rows="8" placeholder="Cevabınızı buraya yazınız..."
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
                <textarea class="code-input" rows="10" spellcheck="false" placeholder="// Kodunuzu buraya yazın..."
                    oninput="userAnswers[${index}]=this.value; updateNavVisuals(); saveProgressToLocal()"
                    onkeydown="if(event.key==='Tab'){event.preventDefault();this.setRangeText('    ',this.selectionStart,this.selectionStart,'end')}"
                >${val.startsWith('[DRAW]') ? '' : val}</textarea>
            </div>
        `;
        if(initialMode === 'draw') {
             setTimeout(() => initCanvas(`canvas-${index}`, index), 100);
        }

    // 2. Durum: Checkbox
    } else if (q.type === 'checkbox') {
        let sel = currentAns ? JSON.parse(currentAns) : [];
        q.options.forEach((opt, i) => {
            const isChk = sel.includes(i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="checkbox" ${isChk?'checked':''}><span>${opt}</span>`;
            lbl.onclick = (e) => { if(e.target.tagName!=='INPUT') lbl.querySelector('input').click(); };
            lbl.querySelector('input').onchange = (e) => {
                if(e.target.checked) sel.push(i); else sel = sel.filter(x=>x!==i);
                userAnswers[index] = JSON.stringify(sel);
                renderOptions(q, index); updateNavVisuals(); saveProgressToLocal();
            };
            div.appendChild(lbl);
        });

    // 3. Durum: Radio
    } else { 
        q.options.forEach((opt, i) => {
            const isChk = (currentAns !== null && parseInt(currentAns) === i);
            const lbl = document.createElement('label');
            if(isChk) lbl.className='selected';
            lbl.innerHTML = `<input type="radio" name="opt${index}" ${isChk?'checked':''}><span>${opt}</span>`;
            lbl.onclick = () => { 
                userAnswers[index] = i.toString(); 
                renderOptions(q, index); updateNavVisuals(); saveProgressToLocal(); 
            };
            div.appendChild(lbl);
        });
    }
}

// -----------------------------------------------------
// 6. SINAV BİTİŞ VE ZAMANLAYICI
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
    let bosSayisi = 0;
    activeQuestions.forEach((q, index) => { if (userAnswers[index] === null || userAnswers[index] === "") bosSayisi++; });
    let uyariMetni = bosSayisi > 0 ? `⚠️ DİKKAT: ${bosSayisi} soruyu BOŞ bıraktınız!` : "Sınavı bitirmek istediğinize emin misiniz?";
    
    Swal.fire({
        title: 'Sınavı Bitir?', text: uyariMetni, icon: bosSayisi>0?'warning':'question',
        showCancelButton: true, confirmButtonText: 'Evet, Bitir', cancelButtonText: 'Hayır'
    }).then((result) => { if (result.isConfirmed) finishQuiz('NORMAL'); });
}

function finishQuiz(type) {
    if (!isExamActive) return;
    isExamActive = false;
    clearInterval(examTimerInterval);
    if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);
    if(hintTimeout) clearTimeout(hintTimeout);
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});

    let score = 0;
    const pts = 100 / activeQuestions.length;

    activeQuestions.forEach((q, i) => {
        if(type.startsWith("CHEATING")) return;
        const correct = deobfuscateAnswer(q._secureAnswer);
        const user = userAnswers[i];
        let isOk = false;
        if (q.type === 'text') isOk = (user && user.toLowerCase() === correct.toLowerCase());
        else isOk = (user === correct);
        if (isOk) score += pts;
    });
    score = Math.round(score);

    document.getElementById('quizScreen').classList.add('hidden');
    const resultScreen = document.getElementById('resultScreen');
    resultScreen.classList.remove('hidden');
    const scoreCard = document.querySelector('.score-card');
    if(scoreCard) scoreCard.classList.add('score-pop-animation');

    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    if (type.startsWith("CHEATING")) {
        fb.innerHTML = "⚠️ KOPYA GİRİŞİMİ - SINAV İPTAL";
        fb.style.color = "red";
        statusNote = "KOPYA";
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "HEARTBEAT", Numara: studentNumber, Isim: studentName, Soru: currentQuestionIndex+1, Kopya: "⚠️ KOPYA", Itiraz: "-" })
        }).catch(e=>{});
    } else {
        if (score >= 50) { fb.innerHTML = "Tebrikler! Geçtiniz 🎉"; fb.style.color = "green"; } 
        else { fb.innerHTML = "Kaldınız."; }
        
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "HEARTBEAT", Numara: studentNumber, Isim: studentName, Soru: "BİTTİ", Kopya: "TAMAMLANDI", Itiraz: "-" })
        }).catch(e=>{});
    }

    generateReviewPanel();
    let itirazMetni = Object.keys(userObjections).map(k => `[Soru ${parseInt(k)+1}: ${userObjections[k]}]`).join(" ") || "-";
    sendToGoogleSheets({ type: "RESULT", Isim: studentName, Numara: studentNumber, Puan: score, Durum: statusNote, Itirazlar: itirazMetni });
    localStorage.removeItem(`exam_progress_${studentNumber}`);
}

// -----------------------------------------------------
// 7. YÖNETİCİ VE DİĞER FONKSİYONLAR
// -----------------------------------------------------
function toggleGlobalExam(status) {
    const msg = status === 'STARTED' ? "Sınav BAŞLATILIYOR..." : "Sınav DURDURULUYOR...";
    Swal.fire({ toast: true, icon: 'info', title: msg, timer: 1500, showConfirmButton: false });
    fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "SET_EXAM_STATUS", status: status }) })
    .then(r=>r.json()).then(d=>{
        if(d.status==='success') Swal.fire({ toast: true, icon: status==='STARTED'?'success':'warning', title: status==='STARTED'?"Sınav Başladı! 🚀":"Sınav Durduruldu ⛔", timer: 2000, showConfirmButton: false });
    });
}

function startAdminMonitor() {
    Swal.fire({ toast: true, icon: 'info', title: 'Canlı İzleme Başlatıldı', position: 'top-end', showConfirmButton: false, timer: 2000 });
    fetchLiveTable();
    if (adminMonitorInterval) clearInterval(adminMonitorInterval);
    adminMonitorInterval = setInterval(fetchLiveTable, 10000);
}

function fetchLiveTable() {
    fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "GET_ADMIN_LIVE" }) })
    .then(r => r.json()).then(rows => {
        const tbody = document.getElementById('liveTableBody');
        tbody.innerHTML = "";
        if (rows.length === 0) { tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:15px;'>Aktif öğrenci yok.</td></tr>"; return; }
        rows.forEach(row => {
            const [num, isim, zaman, soru, kopya, itiraz] = row;
            let rowStyle = "border-bottom:1px solid #eee;";
            let durumIkon = "🟢 Aktif";
            const kopyaStr = kopya ? kopya.toString() : "";
            if (kopyaStr.includes("KOPYA") || kopyaStr.includes("DİKKAT")) { rowStyle = "background:#fee2e2; color:#b91c1c; font-weight:bold;"; durumIkon = "⚠️ DİKKAT"; }
            else if (kopyaStr.includes("TAMAMLANDI")) { rowStyle = "background:#ecfdf5; color:#047857; font-weight:bold;"; durumIkon = "🏁 BİTTİ"; }
            
            const tr = document.createElement('tr');
            tr.style = rowStyle;
            tr.innerHTML = `<td style="padding:8px;">${num}</td><td style="padding:8px;">${isim}</td><td style="padding:8px;">${durumIkon}</td><td style="padding:8px; text-align:center;">${soru}</td><td style="padding:8px; text-align:center;">${itiraz!=="-"?"🚩 VAR":"-"}</td>`;
            tbody.appendChild(tr);
        });
    }).catch(e=>{});
}

function showAdminTab(tabName) {
    document.getElementById('tab-monitor').classList.add('hidden');
    document.getElementById('tab-questions').classList.add('hidden');
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

function uploadQuestions() {
    try {
        const json = JSON.parse(document.getElementById('jsonInput').value);
        if(!Array.isArray(json)) throw new Error();
        document.getElementById('adminStatus').innerText = "Yükleniyor...";
        fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "ADD_BULK", questions: json }) })
        .then(r => r.json()).then(d => { document.getElementById('adminStatus').innerText = d.status==='success'?"Başarılı ✅":"Hata."; });
    } catch { Swal.fire('JSON Formatı Hatalı'); }
}

function deleteQuestions() {
    if(!confirm("Tüm sorular silinsin mi?")) return;
    fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "DELETE_ALL" }) }).then(()=>Swal.fire('Silindi'));
}

function startStudentHeartbeat(isWaiting = false) {
    if (studentHeartbeatInterval) clearInterval(studentHeartbeatInterval);
    studentHeartbeatInterval = setInterval(() => {
        if (!studentNumber) return;
        let cheatStatus = "Temiz", soruDurumu = isWaiting ? "⏳ Bekliyor" : (currentQuestionIndex + 1);
        if (!isWaiting) { if (!isExamActive) return; cheatStatus = document.hidden ? "Sekme Arkada!" : "Temiz"; } 
        else { cheatStatus = "Hazır"; }
        const activeObjection = (userObjections && userObjections[currentQuestionIndex]) ? "VAR" : "-";
        fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ type: "HEARTBEAT", Numara: studentNumber, Isim: studentName, Soru: soruDurumu, Kopya: cheatStatus, Itiraz: isWaiting?"-":activeObjection }) }).catch(e=>{});
    }, isWaiting ? 5000 : 15000);
}

function generateReviewPanel() {
    const div = document.getElementById('reviewArea');
    div.innerHTML = "";
    activeQuestions.forEach((q, i) => {
        const correctIdx = deobfuscateAnswer(q._secureAnswer);
        const userIdx = userAnswers[i];
        let userDisp = "(Boş)", correctDisp = "", isCorrect = false;
        if(q.type === 'text') { userDisp = userIdx || "(Boş)"; correctDisp = correctIdx; isCorrect = (userDisp.toLowerCase() === correctDisp.toLowerCase()); }
        else { userDisp = (userIdx !== null && q.options[userIdx]) ? q.options[userIdx] : "(Boş)"; correctDisp = q.options[correctIdx] ? q.options[correctIdx] : "Hata"; isCorrect = (userIdx === correctIdx); }
        const row = document.createElement('div');
        row.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;
        row.innerHTML = `<b>${i+1}. ${q.question}</b><br>Siz: ${userDisp}<br>Doğru: ${correctDisp}`;
        div.appendChild(row);
    });
}

function toggleReview() { document.getElementById('reviewArea').classList.toggle('hidden'); }
function sendToGoogleSheets(data) { fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(data) }); }
function saveProgressToLocal() { if (!isExamActive || !studentNumber) return; localStorage.setItem(`exam_progress_${studentNumber}`, JSON.stringify({ answers: userAnswers, objections: userObjections, timestamp: new Date().getTime() })); }
function createNavButtons() { const c = document.getElementById('questionNav'); c.innerHTML=""; activeQuestions.forEach((q,i)=>{ const b=document.createElement('button'); b.className='nav-btn'; b.innerText=i+1; b.id=`navBtn-${i}`; b.onclick=()=>{currentQuestionIndex=i; showQuestion(i);}; c.appendChild(b); }); }
function updateNavVisuals() { activeQuestions.forEach((q,i)=>{ const b=document.getElementById(`navBtn-${i}`); if(!b)return; b.className='nav-btn'; if(userAnswers[i]) b.classList.add('answered'); if(userObjections[i]) b.classList.add('flagged'); if(i===currentQuestionIndex) b.classList.add('active'); }); }
function updateFlagButtonColor() { const b = document.getElementById('flagBtn'); if(userObjections[currentQuestionIndex]) { b.style.background="#ef4444"; b.innerText="⚠️ İtiraz Edildi (Düzenle)"; } else { b.style.background="#f59e0b"; b.innerText="⚠️ Bu Soruda Hata Var / İtiraz Et"; } }
function flagQuestion() { const i=currentQuestionIndex; Swal.fire({ title: 'Soruya İtiraz Et', input: 'textarea', inputValue: userObjections[i]||"", showCancelButton: true, confirmButtonText: 'Kaydet' }).then((r) => { if (r.isConfirmed) { if(r.value) userObjections[i]=r.value; else delete userObjections[i]; updateFlagButtonColor(); updateNavVisuals(); saveProgressToLocal(); } }); }

// --- TOOLBAR FONKSİYONLARI ---
function switchTool(index, mode, btn) {
    const container = btn.parentElement;
    Array.from(container.children).forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`box-text-${index}`).classList.add('hidden');
    document.getElementById(`box-draw-${index}`).classList.add('hidden');
    document.getElementById(`box-code-${index}`).classList.add('hidden');
    const targetBox = document.getElementById(`box-${mode}-${index}`);
    targetBox.classList.remove('hidden');
    if (mode === 'draw') { setTimeout(() => initCanvas(`canvas-${index}`, index), 50); } 
    else { 
        if (userAnswers[index] && userAnswers[index].startsWith('[DRAW]')) userAnswers[index] = ""; 
        const input = targetBox.querySelector('textarea');
        if(input) { userAnswers[index] = input.value; saveProgressToLocal(); }
    }
}

let isDrawing = false, lastX = 0, lastY = 0;
function initCanvas(id, index) {
    const canvas = document.getElementById(id); if(!canvas) return;
    if(canvas.width>0 && canvas.height>0) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.getBoundingClientRect().width; canvas.height = 300;
    ctx.strokeStyle='#000'; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.lineWidth=2;
    function draw(e) { if (!isDrawing) return; e.preventDefault(); let cx, cy; if(e.type.includes('touch')) { cx=e.touches[0].clientX; cy=e.touches[0].clientY; } else { cx=e.clientX; cy=e.clientY; } const r=canvas.getBoundingClientRect(); const x=cx-r.left, y=cy-r.top; ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke(); [lastX, lastY]=[x,y]; }
    canvas.addEventListener('mousedown', (e)=>{ isDrawing=true; const r=canvas.getBoundingClientRect(); [lastX, lastY]=[e.clientX-r.left, e.clientY-r.top]; });
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', ()=>{ isDrawing=false; saveCanvas(index, canvas); });
    canvas.addEventListener('mouseout', ()=>isDrawing=false);
    canvas.addEventListener('touchstart', (e)=>{ isDrawing=true; const r=canvas.getBoundingClientRect(); [lastX, lastY]=[e.touches[0].clientX-r.left, e.touches[0].clientY-r.top]; }, {passive:false});
    canvas.addEventListener('touchmove', draw, {passive:false});
    canvas.addEventListener('touchend', ()=>{ isDrawing=false; saveCanvas(index, canvas); });
}
function saveCanvas(i, c) { userAnswers[i] = "[DRAW]" + c.toDataURL(); saveProgressToLocal(); updateNavVisuals(); }
function clearCanvas(id, i) { const c = document.getElementById(id); c.getContext('2d').clearRect(0, 0, c.width, c.height); userAnswers[i]=""; saveProgressToLocal(); updateNavVisuals(); }