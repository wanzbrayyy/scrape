const express = require('express');
const cors = require('cors');
const chalk = require('chalk');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const axios = require('axios');
const { URLSearchParams } = require('url');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const qs = require('qs');

const app = express();
const port = process.env.PORT || 3000;

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir + '/' });

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    const statusColor =
      status >= 500
        ? chalk.red(status)
        : status >= 400
        ? chalk.yellow(status)
        : chalk.green(status);
    console.log(
      `${chalk.blue(method)} ${chalk.cyan(url)} ${statusColor} ${chalk.magenta(duration + 'ms')}`
    );
  });
  next();
});

// ================================================================= //
//                  FUNGSI-FUNGSI PERBAIKAN                            //
// ================================================================= //

const tiktokdl_v2 = async (url) => {
  try {
    const response = await axios.post('https://tikmate.app/api/lookup', new URLSearchParams({ url }), { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://tikmate.app/', 'Origin': 'https://tikmate.app' } });
    if (!response.data.success) throw new Error('Video tidak ditemukan atau URL tidak valid.');
    const token = response.data.token;
    const author = { id: response.data.author_id, name: response.data.author_name, avatar: response.data.author_avatar };
    const final_url = `https://tikmate.app/api/convert?token=${token}`;
    const { data: final_data } = await axios.get(final_url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const videoUrl = final_data.url;
    if (!videoUrl) throw new Error("Gagal mengkonversi video.");
    return { author, caption: response.data.desc, download: videoUrl };
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message || 'Gagal mengambil video TikTok.');
  }
};

const twitterdl_v2 = async (url) => {
    const data = new URLSearchParams({ URL: url });
    const res = await fetch('https://twdown.net/download.php', {
        method: 'POST',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://twdown.net/' },
        body: data
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $('div.card-body > table > tbody > tr').each((_, el) => {
        const quality = $(el).find('td:nth-child(1)').text().trim();
        const url = $(el).find('td:nth-child(4) > a').attr('href');
        if (url) results.push({ quality, url });
    });
    if (results.length === 0) throw new Error('Tidak ada link video yang tersedia.');
    return {
        desc: $('div.card-body > p.card-text').text().trim() || null,
        thumbnail: $('div.card-body > img.card-img-top').attr('src') || null,
        videos: results
    };
};

const pinterestSearchVideo_v2 = async (query) => {
    if (!query) throw new Error("Query wajib diisi");
    const url = `https://id.pinterest.com/search/videos/?q=${encodeURIComponent(query)}&rs=content_type_filter`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } });
    const html = await res.text();
    if (!html || html.length < 1000) throw new Error("Gagal memuat halaman Pinterest.");
    const $ = cheerio.load(html);
    const pins = new Set();
    $('script[data-relay-response="true"][type="application/json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html());
            const findPins = (obj) => {
                if (obj && typeof obj === 'object') {
                    if (obj.id && obj.__typename === 'Pin' && obj.videos?.video_list?.V_720P) {
                        pins.add(JSON.stringify({ id: obj.id, url: `https://id.pinterest.com/pin/${obj.id}/`, title: obj.title || obj.grid_title, video_url: obj.videos.video_list.V_720P.url }));
                    }
                    Object.values(obj).forEach(findPins);
                } else if (Array.isArray(obj)) {
                    obj.forEach(findPins);
                }
            };
            findPins(json);
        } catch (e) {}
    });
    if (pins.size === 0) throw new Error("Pin video tidak ditemukan. Coba query yang berbeda.");
    return Array.from(pins).map(item => JSON.parse(item));
}

const toHitamRighthair_v2 = async (imageUrl, skinTone = "deep_brown") => {
    const buffer = await getBuffer(imageUrl);
    const form = new FormData();
    form.append('image', buffer, { filename: path.basename(imageUrl) || 'image.jpg', contentType: 'image/jpeg' });
    const upload = await fetch('https://api.righthair.ai/api/v2/image/upload', {
        method: 'POST', headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' }, body: form
    }).then(r => r.json());
    if (upload.code !== 200 || !upload.data?.img_name) throw new Error("Upload image gagal");
    const imgName = upload.data.img_name;
    const createJob = await fetch('https://api.righthair.ai/api/v2/skin-tone-filter/create', {
        method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/json', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' }, body: JSON.stringify({ skin_tone_type: skinTone, img_name: imgName })
    }).then(r => r.json());
    if (createJob.code !== 200 || !createJob.data?.job_id) throw new Error("Gagal membuat job skin tone");
    const jobId = createJob.data.job_id;
    for (let i = 0; i < 20; i++) {
        const result = await fetch(`https://api.righthair.ai/api/v2/task/result?job_id=${jobId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' }
        }).then(r => r.json());
        if (result?.data?.status === "success") {
            if (!result.data.task_result) throw new Error("Result image tidak ditemukan meskipun status sukses.");
            return result.data.task_result;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error("Proses gambar timeout atau gagal setelah 30 detik.");
}

const animagine_v2 = (options = {}) => {
  const task = new Promise(async (resolve, reject) => {
    try {
      let { prompt = "Cute Cat", negative = "Not Real", style = "Anime", sampler = "Euler a", ratio = "896 x 1152", quality = "Standard", width = "1024", height = "1024" } = options;
      const BASE_URL = "https://linaqruf-animagine-xl.hf.space";
      const session_hash = Math.random().toString(36).substring(2);
      if (!/\(None\)|Cinematic|Photographic|Anime|Manga|Digital Art|Pixel art|Fantasy art|Neonpunk|3D Model/.test(style)) style = "Anime";
      if (!/DDIM|Euler a|Euler|DPM\+\+ 2M Karras|DPM\+\+ 2M SDE Karras|DPM\+\+ SDE Karras/.test(sampler)) sampler = "Euler a";
      if (!/\(none\)|Light|Standard|Heavy/.test(quality)) quality = "Heavy";
      if (!/Custom|640 x 1536|832 x 1216|1024 x 1024|1152 x 896|1344 x 768|768 x 1344|896 x 1152|1216 x 832|1536 x 640/.test(ratio)) ratio = "896 x 1152";
      if (quality === "Custom") {
        if (!width || isNaN(width) || +width > 2048) return reject(new Error("Enter Valid Image Width Below 2048"));
        if (!height || isNaN(height) || +height > 2048) return reject(new Error("Enter Valid Image Height Below 2048"));
      }
      const headers = { origin: BASE_URL, referer: BASE_URL + "/?", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "content-type": "application/json" };
      const { data: token } = await fetch(BASE_URL + "/run/predict", { method: "POST", headers, body: JSON.stringify({ data: [0, true], event_data: null, fn_index: 4, session_hash, trigger_id: 6 }) }).then((v) => v.json());
      await fetch(BASE_URL + "/queue/join?", { method: "POST", headers, body: JSON.stringify({ data: [prompt, negative, token[0], width, height, 7, 28, sampler, ratio, style, quality, false, 0.55, 1.5, true], event_data: null, fn_index: 5, session_hash, trigger_id: 7 }) }).then((v) => v.json());
      const stream = await fetch(BASE_URL + "/queue/data?" + new URLSearchParams({ session_hash })).then((v) => v.body);
      stream.on("data", (v) => {
        const dataString = v.toString();
        if (!dataString.startsWith("data:")) return;
        const data = JSON.parse(dataString.substring(5));
        if (data.msg === "process_completed") {
            if (!data.success) return reject(new Error("Image Generation Failed!"));
            resolve(data.output.data[0]);
            stream.destroy();
        }
      });
      stream.on('error', (e) => reject(e));
    } catch (e) {
      reject(e);
    }
  });
  return Promise.race([
      task,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Animagine request timed out after 2 minutes')), 120000))
  ]);
};

// ================================================================= //
//                  FUNGSI-FUNGSI ORIGINAL & DARI USER                 //
// ================================================================= //

const sendToGPT = async (message) => { try { const data = JSON.stringify({ messages: [{ content: message, role: "user" }] }); const options = { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.174 Mobile Safari/537.36', 'Content-Type': 'application/json', 'Origin': 'https://deepseek.me', 'Referer': 'https://deepseek.me/', }, body: data }; const response = await fetch('https://wewordle.org/gptapi/v1/web/turbo', options); const result = await response.json(); return result?.message?.content || "No Respons"; } catch (error) { console.error(chalk.red('Error in sendToGPT:'), error); throw new Error('Terjadi kesalahan saat berkomunikasi dengan GPT API'); } }
const flataiGenerateImage = async (prompt) => { if (!prompt) throw new Error('Prompt wajib diisi'); try { const page = await fetch('https://flatai.org/ai-image-generator-free-no-signup/').then(res => res.text()); const nonceMatch = page.match(/ai_generate_image_nonce":"([a-f0-9]+)"/i); if (!nonceMatch) throw new Error('Nonce tidak ditemukan'); const nonce = nonceMatch[1]; const data = new URLSearchParams(); data.append('action', 'ai_generate_image'); data.append('nonce', nonce); data.append('prompt', prompt); data.append('aspect_ratio', '1:1'); data.append('seed', Date.now().toString()); data.append('style_model', 'flataipro'); const res = await fetch('https://flatai.org/wp-admin/admin-ajax.php', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003)', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'origin': 'https://flatai.org', 'referer': 'https://flatai.org/ai-image-generator-free-no-signup/' }, body: data.toString() }); const json = await res.json(); if (!json || json.success === false) throw new Error('Generate image gagal'); return json; } catch (error) { console.error(chalk.red('Error in flataiGenerateImage:'), error); throw new Error('Terjadi kesalahan saat generate gambar'); } }
const searchHappyMod = async (query) => { const data = new URLSearchParams(); data.append('q', query); const res = await fetch('https://id.happymod.cloud/search.html', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Mobile Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html' }, body: data }); const html = await res.text(); const $ = cheerio.load(html); const results = []; $('ul.list > li.list-item').each((_, el) => { const a = $(el).find('a.list-box'); const title = a.find('.list-info-title').text().trim(); const href = a.attr('href'); const url = href ? 'https://id.happymod.cloud' + href + "download.html" : null; const size = a.find('.list-info-text').first().find('span').eq(2).text().trim() || null; const img = a.find('img').attr('data-src') || a.find('img').attr('src') || null; if (title && url) results.push({ title, url, size, icon: img }); }); return results; }
const fetchNekopoiV1 = async (query) => { const searchUrl = `https://nekopoi.care/search/${encodeURIComponent(query)}`; const { data: html } = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } }); const $ = cheerio.load(html); const results = []; $("div.result ul li").each((i, li) => { const el = $(li); const aTag = el.find("h2 > a"); const title = aTag.text().trim(); const link = aTag.attr("href"); let duration = null; el.find("div.desc p").each((i, p) => { const pText = $(p).text(); if (/Duration\s*:/i.test(pText) || /Durasi\s*:/i.test(pText)) { duration = pText.replace(/Duration\s*:\s*/i, "").replace(/Durasi\s*:\s*/i, "").trim(); return false; } }); results.push({ title, link, duration }); }); for (let item of results) { try { const { data: detailHtml } = await axios.get(item.link, { headers: { "User-Agent": "Mozilla/5.0" } }); const $$ = cheerio.load(detailHtml); const streamIds = ["#stream3", "#stream2", "#stream1"]; let videoSrc = null; for (const id of streamIds) { const iframe = $$(id + " iframe.vids"); if (iframe.length) { videoSrc = iframe.attr("src"); if (videoSrc) break; } } item.videoSrc = videoSrc || null; } catch (e) { item.videoSrc = null; } } return results; }
const pinterestSearchVideo = async (query) => { if (!query) throw new Error("Query wajib diisi"); const url = `https://id.pinterest.com/search/videos/?q=${encodeURIComponent(query)}&rs=content_type_filter`; const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36", } }); const html = await res.text(); if (!html || html.length < 1000) throw new Error("HTML kosong / terblokir"); const $ = cheerio.load(html); const pins = new Set(); $("[data-test-pin-id]").each((_, el) => { const id = $(el).attr("data-test-pin-id"); if (id && /^\d+$/.test(id)) pins.add(`https://id.pinterest.com/pin/${id}/`); }); if (pins.size === 0) throw new Error("Pin ID tidak ditemukan"); return [...pins]; }
const spotdownSearchAndDownload = async (query) => { const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.174 Mobile Safari/537.36', 'Referer': 'https://spotdown.org/' }; const res = await fetch(`https://spotdown.org/api/song-details?url=${encodeURIComponent(query)}`, { headers }); const json = await res.json(); if (!json.songs || !json.songs.length) throw new Error('Lagu tidak ditemukan'); const firstSong = json.songs[0]; return { search: { title: firstSong.title, artist: firstSong.artist, duration: firstSong.duration, thumbnail: firstSong.thumbnail, spotify_url: firstSong.url, }, download: `https://spotdown.org/api/check-direct-download?url=${encodeURIComponent(firstSong.url)}`, }; }
const generateQuotaUser = (length = 40) => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let result = ''; for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length)); return result; }
const getYoutubeChannelInfoByUsername = async (username) => { const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.174 Mobile Safari/537.36' } }; const url = `https://www.youtube.com/@${username}`; const yt = await fetch(`https://ytapi.apps.mattw.io/v1/resolve_url?url=${encodeURIComponent(url)}`, options).then(res => res.json()); if (!yt.channelId) throw new Error('Channel ID not found'); const quotaUser = generateQuotaUser(); const channelInfo = await fetch(`https://ytapi.apps.mattw.io/v3/channels?key=foo1&quotaUser=${quotaUser}&part=id%2Csnippet%2Cstatistics%2CbrandingSettings%2CcontentDetails%2Clocalizations%2Cstatus%2CtopicDetails&id=${yt.channelId}&_=${Date.now()}`, options).then(res => res.json()); return channelInfo.items; }
const randomTT = (length = 8) => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let res = ''; for (let i = 0; i < length; i++) res += chars.charAt(Math.floor(Math.random() * chars.length)); return res; }
const randomIP = () => { return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.'); }
const sssTikDownload = async (tiktokUrl) => { const data = new URLSearchParams(); data.append('id', tiktokUrl); data.append('locale', 'id'); data.append('tt', randomTT(8)); data.append('debug', `ab=1&loc=ID&ip=${randomIP()}`); const res = await fetch('https://ssstik.io/abc?url=dl', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143 Mobile Safari/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'origin': 'https://ssstik.io', 'referer': 'https://ssstik.io/id-1', 'x-requested-with': 'mark.via.gp' }, body: data }); const html = await res.text(); const $ = cheerio.load(html); const author = $('#avatarAndTextUsual h2').first().text().trim() || $('#avatar_and_text h2').first().text().trim(); const caption = $('#avatarAndTextUsual p.maintext').first().text().trim() || $('#avatar_and_text p.maintext').first().text().trim(); const video = $('a.without_watermark').attr('href'); const slides = []; $('#mainpicture .splide__slide a.download_link.slide').each((i, el) => { const url = $(el).attr('href'); if (url) slides.push(url); }); if (video) return { type: 'video', author, caption, download: video }; if (slides.length > 0) return { type: 'slides', author, caption, total: slides.length, slides }; throw new Error('Gagal mengambil video atau foto slide'); }
const transformImageToGhibli = async (filePath) => { const buffer = fs.readFileSync(filePath); const base64Image = buffer.toString('base64'); const data = JSON.stringify({ image: base64Image, prompt: "Transform this image into beautiful Studio Ghibli anime art style with soft colors, dreamy atmosphere, and hand-painted aesthetic", model: "gpt-image-1", n: 1, size: "1024x1024", quality: "low" }); const response = await fetch('https://ghibli-proxy.netlify.app/.netlify/functions/ghibli-proxy', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' }, body: data }); const result = await response.json(); if (!result.success || !result.data || !result.data.length) throw new Error("Response tidak valid"); return result.data[0].b64_json; }
const getBuffer = async (url) => { const res = await axios.get(url, { responseType: 'arraybuffer' }); return Buffer.from(res.data); }
const toHitamRighthair = async (imageUrl, skinTone = "deep_brown") => { const buffer = await getBuffer(imageUrl); const form = new FormData(); form.append('image', buffer, { filename: path.basename(imageUrl), contentType: 'image/jpeg' }); const upload = await fetch('https://api.righthair.ai/api/v2/image/upload', { method: 'POST', headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' }, body: form }).then(r => r.json()); if (upload.code !== 200 || !upload.data?.img_name) throw new Error("Upload image gagal"); const imgName = upload.data.img_name; const createJob = await fetch('https://api.righthair.ai/api/v2/skin-tone-filter/create', { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/json', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' }, body: JSON.stringify({ skin_tone_type: skinTone, img_name: imgName }) }).then(r => r.json()); if (createJob.code !== 200 || !createJob.data?.job_id) throw new Error("Gagal membuat job skin tone"); const jobId = createJob.data.job_id; let result; while (true) { result = await fetch(`https://api.righthair.ai/api/v2/task/result?job_id=${jobId}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'origin': 'https://righthair.ai', 'referer': 'https://righthair.ai/' } }).then(r => r.json()); if (result?.data?.status === "success") break; await new Promise(r => setTimeout(r, 1000)); } if (!result?.data?.task_result) throw new Error("Result image tidak ditemukan"); return result.data.task_result; }
const uploadImageToUrl = async (imagePath) => { const data = new FormData(); const buffer = fs.readFileSync(imagePath); data.append('file', buffer, { filename: path.basename(imagePath), contentType: 'image/jpeg' }); const options = { method: 'POST', headers: { ...data.getHeaders(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.174 Mobile Safari/537.36', 'origin': 'https://www.image2url.com', 'referer': 'https://www.image2url.com/' }, body: data }; const res = await fetch('https://www.image2url.com/api/upload', options); return await res.json(); }
const Ytdl = async (url) => { const options = { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15; 23124RA7EO Build/AQ3A.240829.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.174 Mobile Safari/537.36', 'Content-Type': 'application/json', 'origin': 'https://www.clipto.com', 'referer': 'https://www.clipto.com/id/media-downloader/youtube-downloader', 'Cookie': 'NEXT_LOCALE=id' }, body: JSON.stringify({ url }) }; return fetch('https://www.clipto.com/api/youtube', options).then(response => response.json()); }
const generateTT = (length = 32) => { const chars = "abcdef0123456789"; let out = ""; for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]; return out; }
const extractVideo = ($) => { let link = $("a.quality-best").attr("data-directurl"); if (link) return { quality: "HD", url: link }; $("a.download-btn").each((_, el) => { if (!link && $(el).text().includes("480")) link = $(el).attr("data-directurl") || $(el).attr("href"); }); if (link) return { quality: "480p", url: link }; $("a.download-btn").each((_, el) => { if (!link && $(el).text().includes("320")) link = $(el).attr("data-directurl") || $(el).attr("href"); }); if (link) return { quality: "320p", url: link }; $("a.download-btn").each((_, el) => { const direct = $(el).attr("data-directurl") || $(el).attr("href"); if (!link && direct && direct.startsWith("http")) link = direct; }); return link ? { quality: "unknown", url: link } : null; }
const ssstwitterDL = async (tweetUrl) => { const data = new URLSearchParams({ id: tweetUrl, locale: "id", tt: generateTT(), ts: Math.floor(Date.now() / 1000), source: "form" }); const res = await fetch("https://ssstwitter.com/id", { method: "POST", headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "origin": "https://ssstwitter.com", "referer": "https://ssstwitter.com/id", }, body: data.toString() }); const video = extractVideo(cheerio.load(await res.text())); if (!video) throw new Error("Tidak ada link video yang tersedia"); return { status: true, quality: video.quality, url: video.url }; }
const extractSkey = (videoUrl) => { const match = videoUrl.match(/video-([a-zA-Z0-9]+)/) || videoUrl.match(/\/([a-zA-Z0-9]{6,})\//); return match ? match[1] : null; }
const xnxxInfo = async (videoUrl) => { if (!videoUrl) throw new Error('URL kosong'); const skey = extractSkey(videoUrl); if (!skey) throw new Error('Gagal mengambil skey dari URL'); const data = new URLSearchParams({ surl: videoUrl, skey: skey }); const options = { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'origin': 'https://www.downloadxnxxvideo.com', 'referer': 'https://www.downloadxnxxvideo.com/', 'x-requested-with': 'mark.via.gp' }, body: data }; const res = await fetch('https://video.google-files.info/makeuri.php', options); const json = await res.json(); if (json.err !== 0) throw new Error('API error'); const mp4s = json.formats?.filter(f => f.url && f.ext === 'mp4' && f.protocol === 'https') || []; const cdn = mp4s.find(f => f.format_id === 'high')?.url || mp4s[0]?.url || null; return { title: json.fulltitle || json.title || null, thumbnail: json.thumbnail || null, download: cdn }; }
const animagine = (options = {}) => { return new Promise(async (resolve, reject) => { try { let { prompt = "Cute Cat", negative = "Not Real", style = "Anime", sampler = "Euler a", ratio = "896 x 1152", quality = "Standard", width = "1024", height = "1024", } = options; const BASE_URL = "https://linaqruf-animagine-xl.hf.space"; const session_hash = Math.random().toString(36).substring(2); if (!/\(None\)|Cinematic|Photographic|Anime|Manga|Digital Art|Pixel art|Fantasy art|Neonpunk|3D Model/.test(style)) style = "Anime"; if (!/DDIM|Euler a|Euler|DPM\+\+ 2M Karras|DPM\+\+ 2M SDE Karras|DPM\+\+ SDE Karras/.test(sampler)) sampler = "Euler a"; if (!/\(none\)|Light|Standard|Heavy/.test(quality)) quality = "Heavy"; if (!/Custom|640 x 1536|832 x 1216|1024 x 1024|1152 x 896|1344 x 768|768 x 1344|896 x 1152|1216 x 832|1536 x 640/.test(ratio)) ratio = "896 x 1152"; if (quality === "Custom") { if (!width || isNaN(width) || +width > 2048) return reject("Enter Valid Image Width Below 2048"); if (!height || isNaN(height) || +height > 2048) return reject("Enter Valid Image Height Below 2048"); } const headers = { origin: BASE_URL, referer: BASE_URL + "/?", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "content-type": "application/json" }; const { data: token } = await fetch(BASE_URL + "/run/predict", { method: "POST", headers, body: JSON.stringify({ data: [0, true], event_data: null, fn_index: 4, session_hash, trigger_id: 6 }) }).then((v) => v.json()); await fetch(BASE_URL + "/queue/join?", { method: "POST", headers, body: JSON.stringify({ data: [prompt, negative, token[0], width, height, 7, 28, sampler, ratio, style, quality, false, 0.55, 1.5, true], event_data: null, fn_index: 5, session_hash, trigger_id: 7 }) }).then((v) => v.json()); const stream = await fetch(BASE_URL + "/queue/data?" + new URLSearchParams({ session_hash })).then((v) => v.body); stream.on("data", (v) => { const dataString = v.toString(); if (!dataString.includes("data: ")) return; const data = JSON.parse(dataString.split("data: ")[1]); if (data.msg !== "process_completed") return; if (!data.success) return reject("Image Generation Failed!"); return resolve(data.output.data[0]); }); } catch (e) { reject(e); } }); };
const ttSearch = (query) => { return new Promise(async (resolve, reject) => { try { const { data } = await axios("https://tikwm.com/api/feed/search", { headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", cookie: "current_language=en", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36" }, data: { keywords: query, count: 12, cursor: 0, web: 1, hd: 1 }, method: "POST" }); resolve(data.data); } catch (e) { reject(e); } }); };
const random_mail = async () => { const link = "https://dropmail.me/api/graphql/web-test-wgq6m5i?query=mutation%20%7BintroduceSession%20%7Bid%2C%20expiresAt%2C%20addresses%20%7Baddress%7D%7D%7D"; try { let response = await fetch(link); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); let data = await response.json(); let email = data["data"]["introduceSession"]["addresses"][0]["address"]; let id_ = data["data"]["introduceSession"]["id"]; let time = data["data"]["introduceSession"]["expiresAt"]; return { email, id: id_, expires: time }; } catch (error) { throw error; } };
const downloadCapcut = async (Url) => { try { const token = Url.match(/\d+/)[0]; const response = await fetch(`https://ssscapcut.com/api/download/${token}`, { method: "GET", headers: { Accept: "/", "User-Agent": "Mozilla/5.0 (Linux; Android 13; CPH2217 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.153 Mobile Safari/537.36", "X-Requested-With": "acr.browser.barebones", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty", Referer: "https://ssscapcut.com/", "Accept-Encoding": "gzip, deflate", "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7", Cookie: "sign=2cbe441f7f5f4bdb8e99907172f65a42; device-time=1685437999515" } }); return await response.json(); } catch (error) { throw error; } };
const capcutdetail = async (link) => { const { data } = await axios.get(link); const $ = cheerio.load(data); const elements = $("main#main div.ct-container-full article"); return elements.map((_, element) => ({ id: $(element).attr("id"), time: $("main#main").find("time.ct-meta-element-date").text().trim(), template: $(element).find(".wp-block-buttons .wp-block-button a").attr("data-template-id"), link: $(element).find("a.wp-block-button__link").attr("href"), imageSrc: $(element).find("video").attr("poster"), title: $(element).find("h2").text().trim(), videoSrc: $(element).find("video source").attr("src"), description: $(element).find(".entry-content p").text().trim(), })).get(); };
const capcutsearch = async (s) => { const { data } = await axios.get("https://capcut-templates.com/?s=" + s); const $ = cheerio.load(data); const elements = $("main#main div.ct-container section div.entries article"); const detailPromises = elements.map(async (index, element) => { const link = $(element).find("a.ct-image-container").attr("href"); const detail = await capcutdetail(link); const imageSrc = $(element).find("img").attr("src"); const title = $(element).find("h2.entry-title a").text().trim(); return { id: $(element).attr("id"), link, detail, imageSrc, title }; }).get(); return Promise.all(detailPromises); };
const aigpt = async (prompt) => { const { data } = await axios.get("https://tools.revesery.com/ai/ai.php?query=" + prompt, { headers: { Accept: "*/*", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.9999.999 Safari/537.36" } }); return data.result; };
const githubstalk = async (user) => { const { data } = await axios.get("https://api.github.com/users/" + user); return { username: data.login, nickname: data.name, bio: data.bio, id: data.id, nodeId: data.node_id, profile_pic: data.avatar_url, url: data.html_url, type: data.type, admin: data.site_admin, company: data.company, blog: data.blog, location: data.location, email: data.email, public_repo: data.public_repos, public_gists: data.public_gists, followers: data.followers, following: data.following, ceated_at: data.created_at, updated_at: data.updated_at }; };
const npmstalk = async (packageName) => { let { data } = await axios.get("https://registry.npmjs.org/" + packageName); let versions = data.versions; let allver = Object.keys(versions); let verLatest = allver[allver.length - 1]; let verPublish = allver[0]; let packageLatest = versions[verLatest]; return { name: packageName, versionLatest: verLatest, versionPublish: verPublish, versionUpdate: allver.length, latestDependencies: Object.keys(packageLatest.dependencies || {}).length, publishDependencies: Object.keys(versions[verPublish].dependencies || {}).length, publishTime: data.time.created, latestPublishTime: data.time[verLatest] }; };
const savefrom = async (url) => { let body = new URLSearchParams({ sf_url: encodeURI(url), sf_submit: "", new: 2, lang: "id", app: "", country: "id", os: "Windows", browser: "Chrome", channel: " main", "sf-nomad": 1 }); let { data } = await axios({ url: "https://worker.sf-tools.com/savefrom.php", method: "POST", data: body, headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://id.savefrom.net", referer: "https://id.savefrom.net/", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537.36" } }); let exec = '[]["filter"]["constructor"](b).call(a);'; data = data.replace(exec, `\ntry {\ni++;\nif (i === 2) scriptResult = ${exec.split(".call")[0]}.toString();\nelse (\n${exec.replace(/;/, "")}\n);\n} catch {}`); let context = { scriptResult: "", i: 0 }; vm.createContext(context); new vm.Script(data).runInContext(context); return JSON.parse(context.scriptResult.split("window.parent.sf.videoResult.show(")?.[1].split(");")?.[0]); };
const BstationDl = (url) => savefrom(url); // Perbaikan BstationDl
const wallpaperhd = (chara) => { return new Promise((resolve, reject) => { axios.get("https://wall.alphacoders.com/search.php?search=" + chara + "&filter=4K+Ultra+HD").then(({ data }) => { const $ = cheerio.load(data); const result = []; $("div.boxgrid > a > picture").each(function (a, b) { result.push($(b).find("img").attr("src").replace("thumbbig-", "")); }); resolve(result); }).catch(reject); }); };
const twitter = (link) => { return new Promise((resolve, reject) => { let config = { URL: link }; axios.post("https://twdown.net/download.php", qs.stringify(config), { headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9", "sec-ch-ua": '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"', "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", cookie: "_ga=GA1.2.1388798541.1625064838; _gid=GA1.2.1351476739.1625064838; __gads=ID=7a60905ab10b2596-229566750eca0064:T=1625064837:RT=1625064837:S=ALNI_Mbg3GGC2b3oBVCUJt9UImup-j20Iw; _gat=1" } }).then(({ data }) => { const $ = cheerio.load(data); resolve({ desc: $("div:nth-child(1) > div:nth-child(2) > p").text().trim(), thumb: $("div:nth-child(1) > img").attr("src"), video_sd: $("tr:nth-child(2) > td:nth-child(4) > a").attr("href"), video_hd: $("tbody > tr:nth-child(1) > td:nth-child(4) > a").attr("href"), audio: "https://twdown.net/" + $("body > div.jumbotron > div > center > div.row > div > div:nth-child(5) > table > tbody > tr:nth-child(3) > td:nth-child(4) > a").attr("href") }); }).catch(reject); }); };
const jadianime = async (url) => { const { data } = await axios.post("https://tools.revesery.com/image-anime/convert.php", new URLSearchParams(Object.entries({ "image-url": url }))); return data.image; };
const igdl = (url) => { return new Promise(async (resolve, reject) => { try { const payload = new URLSearchParams(Object.entries({ url: url, host: "instagram" })); const { data } = await axios.request({ method: "POST", baseURL: "https://saveinsta.io/core/ajax.php", data: payload, headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", cookie: "PHPSESSID=rmer1p00mtkqv64ai0pa429d4o", "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36" } }); const $ = cheerio.load(data); const mediaURL = $("div.row > div.col-md-12 > div.row.story-container.mt-4.pb-4.border-bottom").map((_, el) => "https://saveinsta.io/" + $(el).find("div.col-md-8.mx-auto > a").attr("href")).get(); resolve({ status: 200, media: mediaURL }); } catch (e) { reject({ status: 400, message: "error" }); } }); };
const cai = async (query, character) => { const { data } = await axios.post("https://boredhumans.com/api_celeb_chat.php", `message=${query}&intro=${character}&name=${character}`, { headers: { "User-Agent": "Googlebot-News" } }); return data; };
const parseResult = (data) => { let arr = []; for (let x of data) arr.push({ id: x.id, title: x.title, language: x.lang, pages: x.num_pages, cover: x.cover.t.replace(/a.kontol|b.kontol/, "c.kontol") || x.cover.replace(/a.kontol|b.kontol/, "c.kontol") }); return arr; };
const nhentaihome = async (type = "latest") => { type = { latest: "all", popular: "popular" }[type] || "all"; const { data } = await axios.get("https://same.yui.pw/api/v4/home"); return parseResult(data[type]); };
const nhentaisearch = async (query, sort, page) => { const { data } = await axios.get(`https://same.yui.pw/api/v4/search/${query}/${sort}/${page}/`); return parseResult(data.result); };
const nhentaigetDoujin = async (id) => { const { data } = await axios.get(`https://same.yui.pw/api/v4/book/${+id}`); return data; };
const nhentaigetRelated = async (id) => { const { data } = await axios.get(`https://same.yui.pw/api/v4/book/${+id}/related/`); return parseResult(data.books); };
const shortlink = async (url) => { const isurl = /https?:\/\//.test(url); return isurl ? (await axios.get("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url))).data : ""; };


// API Endpoints
app.get('/', (req, res) => { res.status(200).json({ author: 'wanzofc', status: 'success', message: 'Selamat datang di REST API wanzofc!', endpoints: { gpt: 'POST /api/gpt', image: 'POST /api/generate-image', bstation_dl: 'GET /api/bstation-dl?url=<video_url>', happymod_search: 'GET /api/happymod?q=<query>', nekopoi_search: 'GET /api/nekopoi-search?q=<query>', pinterest_video: 'GET /api/pinterest-video?q=<query>', spotify_search: 'GET /api/spotify?q=<query_or_url>', youtube_channel: 'GET /api/youtube-channel?username=<username>', tiktok_dl: 'GET /api/tiktok-dl?url=<tiktok_url>', to_hitam: 'GET /api/to-hitam?url=<image_url>', to_ghibli: 'POST /api/to-ghibli [file: image]', image_to_url: 'POST /api/image-to-url [file: image]', twitter_dl: 'GET /api/twitter-dl?url=<tweet_url>', yt_dl: 'GET /api/yt-dl?url=<youtube_url>', xnxx_dl: 'GET /api/xnxx-dl?url=<xnxx_url>', animagine: 'POST /api/animagine', tiktok_search: 'GET /api/tiktok-search?q=<query>', random_mail: 'GET /api/random-mail', capcut_dl: 'GET /api/capcut-dl?url=<capcut_url>', capcut_search: 'GET /api/capcut-search?q=<query>', aigpt: 'GET /api/aigpt?prompt=<prompt>', github_stalk: 'GET /api/github-stalk?user=<username>', npm_stalk: 'GET /api/npm-stalk?package=<package_name>', savefrom: 'GET /api/savefrom?url=<video_url>', wallpaper_hd: 'GET /api/wallpaper-hd?q=<query>', twdown: 'GET /api/twdown?url=<tweet_url>', to_anime: 'GET /api/to-anime?url=<image_url>', ig_dl: 'GET /api/ig-dl?url=<instagram_url>', cai: 'POST /api/cai', nhentai_home: 'GET /api/nhentai/home?type=<latest|popular>', nhentai_search: 'GET /api/nhentai/search?q=<query>&sort=<popular|popular-week|date>&page=<number>', nhentai_doujin: 'GET /api/nhentai/doujin?id=<id>', nhentai_related: 'GET /api/nhentai/related?id=<id>', shortlink: 'GET /api/shortlink?url=<url>' } }); });
app.post('/api/gpt', async (req, res) => { const { message } = req.body; if (!message) return res.status(400).json({ error: 'Parameter "message" diperlukan' }); try { res.status(200).json({ response: await sendToGPT(message) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/generate-image', async (req, res) => { const { prompt } = req.body; if (!prompt) return res.status(400).json({ error: 'Parameter "prompt" diperlukan' }); try { res.status(200).json(await flataiGenerateImage(prompt)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/bstation-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { const data = await BstationDl(url); res.status(200).json(data); } catch (error) { res.status(500).json({ error: { message: "Video tidak ditemukan atau gagal diunduh.", originalError: error.message } }); } });
app.get('/api/happymod', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query parameter "q" diperlukan' }); try { res.status(200).json(await searchHappyMod(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/nekopoi-search', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query parameter "q" diperlukan' }); try { res.status(200).json(await fetchNekopoiV1(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/pinterest-video', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query parameter "q" diperlukan' }); try { res.status(200).json(await pinterestSearchVideo_v2(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/spotify', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query parameter "q" diperlukan' }); try { res.status(200).json(await spotdownSearchAndDownload(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/youtube-channel', async (req, res) => { const { username } = req.query; if (!username) return res.status(400).json({ error: 'Query parameter "username" diperlukan' }); try { const results = await getYoutubeChannelInfoByUsername(username); if(!results || results.length === 0) return res.status(404).json({ error: 'Channel tidak ditemukan'}); res.status(200).json(results); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/tiktok-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { res.status(200).json(await tiktokdl_v2(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/to-hitam', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { res.status(200).json({ result_url: await toHitamRighthair_v2(url) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/to-ghibli', upload.single('image'), async (req, res) => { if (!req.file) return res.status(400).json({ error: 'File gambar "image" diperlukan' }); const filePath = req.file.path; try { const base64Image = await transformImageToGhibli(filePath); res.status(200).json({ success: true, image_base64: base64Image }); } catch (error) { res.status(500).json({ error: error.message }); } finally { fs.unlinkSync(filePath); } });
app.post('/api/image-to-url', upload.single('image'), async (req, res) => { if (!req.file) return res.status(400).json({ error: 'File gambar "image" diperlukan' }); const filePath = req.file.path; try { const result = await uploadImageToUrl(filePath); res.status(200).json(result); } catch (error) { res.status(500).json({ error: error.message }); } finally { fs.unlinkSync(filePath); } });
app.get('/api/twitter-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { res.status(200).json(await twitterdl_v2(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/yt-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { res.status(200).json(await Ytdl(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/xnxx-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query parameter "url" diperlukan' }); try { res.status(200).json(await xnxxInfo(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/animagine', async (req, res) => { try { const result = await animagine_v2(req.body); res.status(200).json({ result }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/tiktok-search', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query "q" diperlukan' }); try { res.status(200).json({ result: await ttSearch(q) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/random-mail', async (req, res) => { try { res.status(200).json({ result: await random_mail() }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/capcut-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json(await downloadCapcut(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/capcut-search', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query "q" diperlukan' }); try { res.status(200).json(await capcutsearch(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/aigpt', async (req, res) => { const { prompt } = req.query; if (!prompt) return res.status(400).json({ error: 'Query "prompt" diperlukan' }); try { res.status(200).json({ result: await aigpt(prompt) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/github-stalk', async (req, res) => { const { user } = req.query; if (!user) return res.status(400).json({ error: 'Query "user" diperlukan' }); try { res.status(200).json(await githubstalk(user)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/npm-stalk', async (req, res) => { const { package } = req.query; if (!package) return res.status(400).json({ error: 'Query "package" diperlukan' }); try { res.status(200).json(await npmstalk(package)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/savefrom', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json(await savefrom(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/wallpaper-hd', async (req, res) => { const { q } = req.query; if (!q) return res.status(400).json({ error: 'Query "q" diperlukan' }); try { res.status(200).json(await wallpaperhd(q)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/twdown', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json(await twitter(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/to-anime', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json({ image_base64: await jadianime(url) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/ig-dl', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json(await igdl(url)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/cai', async (req, res) => { const { query, character } = req.body; if (!query || !character) return res.status(400).json({ error: 'Body "query" dan "character" diperlukan' }); try { res.status(200).json({ result: await cai(query, character) }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/nhentai/home', async (req, res) => { const { type } = req.query; try { res.status(200).json(await nhentaihome(type)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/nhentai/search', async (req, res) => { const { q, sort = 'date', page = '1' } = req.query; if (!q) return res.status(400).json({ error: 'Query "q" diperlukan' }); try { res.status(200).json(await nhentaisearch(q, sort, page)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/nhentai/doujin', async (req, res) => { const { id } = req.query; if (!id) return res.status(400).json({ error: 'Query "id" diperlukan' }); try { res.status(200).json(await nhentaigetDoujin(id)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/nhentai/related', async (req, res) => { const { id } = req.query; if (!id) return res.status(400).json({ error: 'Query "id" diperlukan' }); try { res.status(200).json(await nhentaigetRelated(id)); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/shortlink', async (req, res) => { const { url } = req.query; if (!url) return res.status(400).json({ error: 'Query "url" diperlukan' }); try { res.status(200).json({ shortlink: await shortlink(url) }); } catch (error) { res.status(500).json({ error: error.message }); } });

app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

app.listen(port, () => {
  console.log(chalk.yellow(`Server berjalan di http://localhost:${port}`));
});