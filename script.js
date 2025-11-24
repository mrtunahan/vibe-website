// ==================================================================
// ⚠️ DİKKAT: BURADAKİ URL SİZİN KENDİ APPSCRIPT URL'NİZ OLMALI
// ==================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby4yl8CkpbLcUH_lnolN5knW4aSiLC38aOKq9KWjr_SD7wBVgNmSmUBaft6GgjdUlyB/exec';

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

    userAnswers = new Array(activeQuestions.length).fill(null);
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.remove('hidden');
    document.getElementById('displayName').innerText = studentName;
    currentQuestionIndex = 0;
    showQuestion(0);
    startExamTimer();
    

    createNavButtons(); // <-- YENİ: Butonları oluştur
    updateNavVisuals(); // <-- YENİ: İlk durumu boya
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
        // BURAYA EKLENDİ: oninput içine updateNavVisuals() koyduk
        div.innerHTML = `<textarea class="text-answer-input" rows="3" oninput="userAnswers[${index}]=this.value.trim(); updateNavVisuals()">${currentAns||''}</textarea>`;
    
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
                updateNavVisuals(); // <--- YENİ
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
                updateNavVisuals(); // <--- YENİ
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
    isExamActive = false;
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

    // Ekran Değişimi
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.remove('hidden');
    document.getElementById('resultName').innerText = studentName;
    document.getElementById('resultId').innerText = studentNumber;
    document.getElementById('score').innerText = score;

    // Durum Belirleme
    const fb = document.getElementById('feedbackMessage');
    let statusNote = "NORMAL";

    if (type.startsWith("CHEATING")) {
        fb.innerHTML = "⚠️ KOPYA GİRİŞİMİ - SINAV İPTAL";
        fb.style.color = "red";
        statusNote = "KOPYA";
    } else if (score >= 50) {
        fb.innerHTML = "Tebrikler! Geçtiniz 🎉";
        fb.style.color = "green";
    } else {
        fb.innerHTML = "Kaldınız.";
    }

    generateReviewPanel();

    // ----------------------------------------------------------------
    // BURASI YENİ EKLEDİĞİMİZ KISIM (İtirazları Hazırla ve Gönder)
    // ----------------------------------------------------------------
    
    // 1. İtiraz nesnesini okunabilir metne çeviriyoruz
    let itirazMetni = "";
    if (typeof userObjections !== 'undefined') { // userObjections tanımlı mı kontrolü
        Object.keys(userObjections).forEach(key => {
            const soruNo = parseInt(key) + 1;
            itirazMetni += `[Soru ${soruNo}: ${userObjections[key]}] `;
        });
    }

    // 2. Eğer hiç itiraz yoksa "-" koyalım
    if(itirazMetni === "") itirazMetni = "-";

    // 3. Verileri (İtiraz dahil) Google Sheet'e gönderiyoruz
    sendToGoogleSheets({
        type: "RESULT",
        Isim: studentName,
        Numara: studentNumber,
        Puan: score,
        Durum: statusNote,
        Itirazlar: itirazMetni // <-- Yeni alan burada
    });
    loadLeaderboard();
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
// --- LEADERBOARD FONKSİYONU ---
function getLeaderboard() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Ogrenciler");
  if (!sheet) return responseJSON([]);

  // Verileri al (Başlık hariç)
  const data = sheet.getDataRange().getDisplayValues();
  let scores = [];

  for (let i = 1; i < data.length; i++) {
    const isim = data[i][1] + " " + data[i][2]; // Ad + Soyad
    const puan = data[i][3]; // D Sütunu (Puan)

    // Sadece puanı olanları (sınava girmişleri) al
    if (puan && puan.trim() !== "") {
      scores.push({
        name: isim,
        score: parseInt(puan)
      });
    }
  }

  // Puana göre büyükten küçüğe sırala
  scores.sort((a, b) => b.score - a.score);

  // İlk 10 kişiyi al
  const top10 = scores.slice(0, 10);

  return responseJSON({ status: "success", data: top10 });
}
// --- LEADERBOARD FONKSİYONLARI ---

// 1. İsim Sansürleme Fonksiyonu (Ahmet Yılmaz -> Ah*** Yıl***)
function censorName(fullName) {
    if (!fullName) return "*** ***";
    const parts = fullName.split(" ");
    
    // Her kelimenin ilk 2 harfini al, gerisine yıldız koy
    const censoredParts = parts.map(part => {
        if (part.length > 2) {
            return part.substring(0, 2) + "*".repeat(3); // İlk 2 harf + 3 yıldız
        }
        return part + "*"; // Kısa isimse direkt sonuna yıldız
    });
    
    return censoredParts.join(" ");
}

// 2. Leaderboard'u Çek ve Listele
async function loadLeaderboard() {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<li style="text-align:center;">Sıralama yükleniyor...</li>';

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ type: "GET_LEADERBOARD" })
        });
        const result = await response.json();

        if (result.status === "success" && result.data) {
            list.innerHTML = ""; // Listeyi temizle
            
            result.data.forEach((student, index) => {
                const rank = index + 1;
                let rankClass = "";
                let icon = `#${rank}`;

                // İlk 3'e özel ikonlar
                if (rank === 1) { rankClass = "rank-1"; icon = "🥇"; }
                if (rank === 2) { rankClass = "rank-2"; icon = "🥈"; }
                if (rank === 3) { rankClass = "rank-3"; icon = "🥉"; }

                const li = document.createElement('li');
                li.className = `rank-item ${rankClass}`;
                
                // İsim sansürleniyor
                const gizliIsim = censorName(student.name);

                li.innerHTML = `
                    <span>${icon} <span class="censored-name">${gizliIsim}</span></span>
                    <strong>${student.score} P</strong>
                `;
                list.appendChild(li);
            });
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<li style="color:red; text-align:center;">Sıralama alınamadı.</li>';
    }
}