const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fetch = require("node-fetch");
const chalk = require("chalk");
const qrcode = require("qrcode-terminal");
const Jimp = require("jimp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { pino } = require("pino");
const logger = pino({ level: "silent" }); // يمكنك تغيير المستوى إلى "info" إذا أردت عرض سجلات
const OWNER = "249996948250@s.whatsapp.net"; // رقم المطور بصيغة واتساب

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    getMessage: async () => ({})
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      startBot();
    } else if (connection === "open") {
      console.log(chalk.green("تم الاتصال بنجاح!"));
    }
  });

  async function isBotAdmin(jid) {
  try {
    const metadata = await sock.groupMetadata(jid);
    const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net";
    const participant = metadata.participants.find(p => p.id === botNumber);
    return participant?.admin === "admin" || participant?.admin === "superadmin";
  } catch (e) {
    console.error("خطأ أثناء التحقق من صلاحية البوت كمشرف:", e);
    return false;
  }
}
  
  async function isUserAdmin(jid, userJid) {
  try {
    const metadata = await sock.groupMetadata(jid);
    const participant = metadata.participants.find(p => p.id === userJid);
    return participant?.admin === "admin" || participant?.admin === "superadmin";
  } catch (e) {
    console.error("خطأ أثناء التحقق من صلاحية المستخدم كمشرف:", e);
    return false;
  }
}

const fancyReply = async (jid, msg, quoted) => {
  await sock.sendMessage(jid, {
    text: msg,
    contextInfo: {
      isForwarded: true,
      forwardingScore: 999999,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363418034666030@newsletter', // ← هذا هو JID القناة الحقيقية
        serverMessageId: '', // ← اتركه فارغًا، سيظهر كأنها Forwarded
        newsletterName: 'ساكورا-تشان🌸' // ← الاسم الظاهر للمستخدم
      },
      externalAdReply: {
        title: "ساكورا-تشان🌸 | القناة الرسمية",
        body: "📣 اضغط للاشتراك في القناة الآن!",
        mediaType: 2,
        renderLargerThumbnail: true,
        thumbnailUrl: "https://i.ibb.co/3yd8YBsR/d0c04cc1dc284a94d14fce6e7fc0020c.jpg",
        sourceUrl: "https://whatsapp.com/channel/0029Vb67XzG0lwgxKrFyyH3n"
      }
    }
  }, { quoted });
};

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const sender = m.key.participant || m.key.remoteJid;
    const isGroup = m.key.remoteJid.endsWith("@g.us");
    const body = m.message.conversation || m.message.extendedTextMessage?.text || "";
    if (!body.startsWith("!")) return; // تجاهل أي رسالة لا تبدأ بـ !

    const args = body.trim().split(" ");
    const command = args[0].toLowerCase();

  async function fancyReact(m, emoji = "✨") {
  try {
    await sock.sendMessage(m.key.remoteJid, {
      react: {
        text: emoji,
        key: m.key,
      },
    });
  } catch (err) {
    console.error("React error:", err);
  }
}

    // إدارة
    if (command === "!amibotadmin") {
  const isAdmin = await isBotAdmin(m.key.remoteJid);
  return fancyReply(m.key.remoteJid, isAdmin 
    ? "✅ أيــوه! أنا مشرفة في القروب يا سينباي~ 🌸✨" 
    : "❌ للأسف مش مشرفة حاليًا... ما أقدر أتصرف 😿", m);
}

if (command === "!isadmin") {
  const userJid = m.key.participant || m.key.remoteJid;
  const isAdmin = await isUserAdmin(m.key.remoteJid, userJid);
  return fancyReply(m.key.remoteJid, isAdmin 
    ? "🔰 أنت مشرف حقيقي في هذا القروب يا سينباي~ 💪🌟" 
    : "🚫 للأسف، لا تملك صلاحيات الإدارة حاليًا... 😿", m);
}
    
   if (["!kick", "!promote", "!demote", "!setdesc", "!setpp"].includes(command) && isGroup) {
  const groupId = m.key.remoteJid;
  const senderId = m.key.participant || m.key.remoteJid;

  // ✅ التحقق إذا كان البوت مشرف
//  const botIsAdmin = await isBotAdmin(groupId);
//  if (!botIsAdmin) {
//    return fancyReply(groupId, "🚫 آسفة يا سينباي ~ لازم أكون مشرفة عشان أقدر أعمل كدا! 🥺💔", m);
//  }

  // ✅ التحقق إذا كان المرسل مشرف
  const userIsAdmin = await isUserAdmin(groupId, senderId);
  if (!userIsAdmin) {
    return fancyReply(groupId, "⛔ هذا الأمر مخصص للمشرفين فقط يا سينباي! حاول تستأذن أولًا~ 🥺", m);
  }
}

if (command === "!kick") {
  const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target) return fancyReply(m.key.remoteJid, "🌸 منشن الشخص اللي تبغى تطرده يا سينباي!", m);
  try {
    await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "remove");
    return fancyReply(m.key.remoteJid, "🚪✨ تم طرد العضو بنجاح ~ باي باي! 👋💢", m);
  } catch {
    return fancyReply(m.key.remoteJid, "💔 أووه! فشلت عملية الطرد، يمكن العضو مش موجود؟", m);
  }
}

if (command === "!promote") {
  const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target) return fancyReply(m.key.remoteJid, "📌 منشن العضو اللي تبغى ترقيه يا سينباي!", m);
  try {
    await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "promote");
    return fancyReply(m.key.remoteJid, "📈💫 تمت الترقية! الآن هو مشرف مثلك يا سينباي~ 💖", m);
  } catch {
    return fancyReply(m.key.remoteJid, "😣 ما قدرت أرقيه، يمكن في مشكلة بالرتب!", m);
  }
}

if (command === "!demote") {
  const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target) return fancyReply(m.key.remoteJid, "📍 منشن العضو اللي تبغى تنزله من الإدارة يا سينباي!", m);
  try {
    await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "demote");
    return fancyReply(m.key.remoteJid, "📉💔 تم إلغاء الترقية ~ رجع عضو عادي الآن 🌸", m);
  } catch {
    return fancyReply(m.key.remoteJid, "😢 ما قدرت أنزله، في خطأ ما حصل!", m);
  }
}

if (command === "!setdesc") {
  const desc = body.slice(9).trim();
  if (!desc) return fancyReply(m.key.remoteJid, "📝 اكتب وصف المجموعة الجديد بعد الأمر يا سينباي!", m);
  try {
    await sock.groupUpdateDescription(m.key.remoteJid, desc);
    return fancyReply(m.key.remoteJid, "🎀 تم تحديث وصف المجموعة بكل نجاح 🌸", m);
  } catch {
    return fancyReply(m.key.remoteJid, "❌ آسفة، ما قدرت أغير الوصف! يمكن ما عندي صلاحية؟ 😿", m);
  }
}

if (command === "!setpp") {
  if (!m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
    return fancyReply(m.key.remoteJid, "📷 رُد على صورة يا سينباي عشان أقدر أغير صورة المجموعة! 🌼", m);
  }

  try {
    const quotedImage = m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
    const buffer = await downloadMediaMessage({ message: { imageMessage: quotedImage } }, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });

    await sock.updateProfilePicture(m.key.remoteJid, buffer);
    return fancyReply(m.key.remoteJid, "🌟 واااه! تم تحديث صورة القروب بنجاح، كيوت جدًا~ 💕📸", m);
  } catch {
    return fancyReply(m.key.remoteJid, "😖 ما قدرت أغير الصورة، يمكن الصورة مش مناسبة يا سينباي!", m);
  }
}

if (command === "!tagall" && isGroup) {
  try {
    const metadata = await sock.groupMetadata(m.key.remoteJid);
    const members = metadata.participants.map((p) => p.id);
    const mentionText = `╭══ 🎀『 ✨ منشن جماعي ✨ 』🎀══╮\n` +
      `⛩️ الرسالة:\n『 ${body.slice(8).trim() || "⋯ لا توجد رسالة ⋯"} 』\n` +
      `╰═══ ♡ ⛩️ بواسطة سينباي ⛩️ ♡ ═══╯`;
    await sock.sendMessage(m.key.remoteJid, {
      text: mentionText,
      mentions: members,
    }, { quoted: m });
  } catch {
    return fancyReply(m.key.remoteJid, "ياااه! فشل منشن الجميع… آسفة جدًا سينباي 💔", m);
  }
}

if (command === "!tagmsg" && isGroup) {
  if (!m.message.extendedTextMessage?.contextInfo?.quotedMessage) {
    return fancyReply(m.key.remoteJid, "إيييه؟ 😥 يجب أن ترد على رسالة لكي أعمل المنشن يا سينباي!", m);
  }
  try {
    const metadata = await sock.groupMetadata(m.key.remoteJid);
    const members = metadata.participants.map((p) => p.id);
    const quoted = m.message.extendedTextMessage.contextInfo;
    await sock.sendMessage(m.key.remoteJid, {
      forward: quoted.stanzaId
        ? {
            key: {
              remoteJid: m.key.remoteJid,
              fromMe: false,
              id: quoted.stanzaId,
              participant: quoted.participant,
            },
            message: quoted.quotedMessage,
          }
        : undefined,
      mentions: members,
      text: `🍥 منشن جماعي للرسالة السابقة~ \n⌜ من سينباي بكل لطف ✨⌟`,
    }, { quoted: m });
  } catch {
    return fancyReply(m.key.remoteJid, "أوووه نوو! لم أستطع تنفيذ منشن الرسالة 🥲 آسفة سينباي!", m);
  }
}

// !mute — قفل الشات
if (command === "!mute" && isGroup) {
  try {
    await sock.groupSettingUpdate(m.key.remoteJid, "announcement");
    return fancyReply(m.key.remoteJid, "تم قفل الشات! الآن فقط المشرفين يمكنهم الكتابة~", m);
  } catch {
    return fancyReply(m.key.remoteJid, "فشلت عملية القفل، آسفة سينباي!", m);
  }
}

// !unmute — فتح الشات
if (command === "!unmute" && isGroup) {
  try {
    await sock.groupSettingUpdate(m.key.remoteJid, "not_announcement");
    return fancyReply(m.key.remoteJid, "تم فتح الشات! الجميع يستطيع الحديث الآن~", m);
  } catch {
    return fancyReply(m.key.remoteJid, "تعذر فتح الشات، آسفة!", m);
  }
}

// !kickall — طرد كل غير المشرفين ⚠️
if (command === "!kickall" && isGroup) {
  try {
    const metadata = await sock.groupMetadata(m.key.remoteJid);
    const admins = metadata.participants.filter(p => p.admin !== undefined).map(p => p.id);
    const nonAdmins = metadata.participants
      .filter(p => !admins.includes(p.id) && p.id !== sock.user.id)
      .map(p => p.id);
    
    if (nonAdmins.length === 0) return fancyReply(m.key.remoteJid, "لا يوجد أعضاء عاديون لطردهم يا سينباي!", m);

    for (const user of nonAdmins) {
      await sock.groupParticipantsUpdate(m.key.remoteJid, [user], "remove");
    }
    return fancyReply(m.key.remoteJid, "تم طرد جميع الأعضاء غير المشرفين 😈", m);
  } catch {
    return fancyReply(m.key.remoteJid, "فشلت عملية الطرد الجماعي، ربما لست مشرفة يا سينباي!", m);
  }
}

// !tagadmins — منشن المشرفين فقط
if (command === "!tagadmins" && isGroup) {
  try {
    const metadata = await sock.groupMetadata(m.key.remoteJid);
    const admins = metadata.participants.filter(p => p.admin !== undefined).map(p => p.id);
    const mentionText = `📣 منشن للمشرفين:\n${body.slice(11).trim() || "أين أنتم؟"}\n👑`;
    await sock.sendMessage(m.key.remoteJid, {
      text: mentionText,
      mentions: admins,
    }, { quoted: m });
  } catch {
    return fancyReply(m.key.remoteJid, "فشل منشن المشرفين، آسفة!", m);
  }
}

if (command === "!revoke") {
  try {
    const code = await sock.groupRevokeInvite(m.key.remoteJid);
    return fancyReply(m.key.remoteJid, `🔁 تم إعادة ضبط رابط الدعوة:\nhttps://chat.whatsapp.com/${code}`, m);
  } catch {
    return fancyReply(m.key.remoteJid, "😔 فشلت في إعادة ضبط الرابط، تأكد إني مشرفة!", m);
  }
}

if (command === "!sticker") {
  let msg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || m.message;
  let type = Object.keys(msg || {})[0];

  if (!["imageMessage", "videoMessage"].includes(type)) {
    return fancyReply(m.key.remoteJid, "🎴 أرسل صورة أو فيديو أو ردّ عليه بـ !sticker يا سينباي~", m);
  }

  await fancyReact(m, "🧚");

  try {
    const mediaBuffer = await downloadMediaMessage(
      { message: msg },
      "buffer",
      {},
      { reuploadRequest: sock }
    );

    const isVideo = type === "videoMessage";
    if (isVideo && msg.videoMessage.seconds > 10)
      return fancyReply(m.key.remoteJid, "🎥 الفيديو طويل جدًا! أرسله أقل من 10 ثواني يا سينباي~", m);

    const stickerPath = path.join(__dirname, "temp_sticker.webp");

    if (isVideo) {
      // معالجة الفيديو
      const videoPath = path.join(__dirname, "temp_video.mp4");
      fs.writeFileSync(videoPath, mediaBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([
            "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15",
            "-vcodec", "libwebp",
            "-loop", "0",
            "-ss", "00:00:00",
            "-t", "00:00:10",
            "-preset", "default",
            "-an",
            "-vsync", "0"
          ])
          .output(stickerPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      fs.unlinkSync(videoPath);
} else {
  // معالجة صورة باستخدام Jimp
  const Jimp = require("jimp");
  const image = await Jimp.read(mediaBuffer);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

  image.resize(512, Jimp.AUTO);
  image.print(
    font,
    0,
    image.getHeight() - 50,
    {
      text: "ساكورا-تشان🌸",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    },
    512,
    50
  );

  await image.writeAsync(stickerPath);

  // تأخير بسيط لتفادي قراءة الملف قبل جهوزه
  await new Promise(resolve => setTimeout(resolve, 300));
}

const stickerBuffer = fs.readFileSync(stickerPath);
fs.unlinkSync(stickerPath);

await sock.sendMessage(m.key.remoteJid, {
  sticker: stickerBuffer,
}, { quoted: m });

  } catch (err) {
    console.error("Sticker error:", err);
    fancyReply(m.key.remoteJid, "🥺 آسفة يا سينباي، فشلت عملية التحويل... جرب من جديد!", m);
  }
}

    // تحميل
    // مثال على أوامر متعددة تستخدم starlights API

if (command === "!pinvideo") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "📌 أرسل رابط فيديو من Pinterest بعد الأمر:\n```!pinvideo https://www.pinterest.com/...```", m);

  try {
    const res = await fetch(`https://api.starlights.uk/api/downloader/pinterest?url=${encodeURIComponent(url)}`);
    const json = await res.json();

    if (!json || json["الحالة"] !== "صحيح" || !json["النتيجة"] || json["النتيجة"].length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من تحميل الفيديو من Pinterest. تأكد من أن الرابط صحيح ومتاح.", m);
    }

    const videoUrl = json["النتيجة"][0];

    await sock.sendMessage(m.key.remoteJid, {
      video: { url: videoUrl },
      caption: `🎥 تم تحميل فيديو Pinterest بنجاح!`,
      mimetype: "video/mp4"
    }, { quoted: m });

  } catch (e) {
    console.error("Pinterest Download Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء تحميل فيديو Pinterest. حاول لاحقًا.", m);
  }
}

if (command === "!lyrics") {
  const query = args.slice(1).join(" ");
  if (!query) return fancyReply(m.key.remoteJid, "🎵 أرسل اسم الأغنية بعد الأمر:\n```!lyrics Shape of You```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v3/lyrics?query=${encodeURIComponent(query)}`);
    const json = await res.json();

    if (!json.results || json.results.length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أجد كلمات لهذه الأغنية، تأكد من الاسم.", m);
    }

    const song = json.results[0];
    const lyrics = song.plainLyrics.slice(0, 4000); // لضمان عدم تجاوز الحد

    await sock.sendMessage(m.key.remoteJid, {
      text: `🎵 *${song.trackName}*\n👤 *${song.artistName}*\n\n📝 ${lyrics}`,
    }, { quoted: m });

  } catch (e) {
    console.error("Lyrics Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب كلمات الأغنية. حاول لاحقًا.", m);
  }
}

if (command === "!weather" || command === "!طقس") {
  const city = args.slice(1).join(" ");
  if (!city) return fancyReply(m.key.remoteJid, "🌤️ أرسل اسم المدينة بعد الأمر:\n```!weather الخرطوم```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v2/clima-s?city=${encodeURIComponent(city)}`);
    const json = await res.json();

    if (!json || !json.weather) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من جلب الطقس. تأكد من اسم المدينة.", m);
    }

    const message = `
📍 *المدينة:* ${json.location}, ${json.country}
🌥️ *الطقس:* ${json.weather}
🌡️ *درجة الحرارة:* ${json.temperature}
🔻 *أدنى درجة:* ${json.minimumTemperature}
🔺 *أعلى درجة:* ${json.maximumTemperature}
💧 *الرطوبة:* ${json.humidity}
🌬️ *الرياح:* ${json.wind}
    `.trim();

    fancyReply(m.key.remoteJid, message, m);

  } catch (e) {
    console.error("Weather Fetch Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب بيانات الطقس.", m);
  }
}

if (command === "!gif") {
  const query = args.slice(1).join(" ");
  if (!query) return fancyReply(m.key.remoteJid, "🎞️ أرسل كلمة للبحث عن صورة متحركة بعد الأمر:\n```!gif cat```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v3/tenor?q=${encodeURIComponent(query)}`);
    const json = await res.json();

    if (!json || !json.success || !json.results || json.results.length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أجد صورًا متحركة لهذا البحث. جرب كلمة أخرى.", m);
    }

    // إرسال أول نتيجة فقط (يمكن تعديل الكود لإرسال أكثر)
    const gif = json.results[0];
    await sock.sendMessage(m.key.remoteJid, {
      video: { url: gif.gif },
      gifPlayback: true,
      caption: `🎬 ${gif.alt || "صورة متحركة"}\n🌐 [Tenor](${gif.link})`,
    }, { quoted: m });

  } catch (e) {
    console.error("GIF Fetch Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب الصورة المتحركة.", m);
  }
}


const axios = require("axios");

if (command === "!spotify") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "🎧 أرسل رابط أغنية سبوتيفاي بعد الأمر:\n```!spotify https://open.spotify.com/track/...```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/spotifydl?url=${encodeURIComponent(url)}`);
    const json = await res.json();

    if (!json || !json.download_url) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من العثور على الأغنية. تأكد من أن الرابط صحيح.", m);
    }

    const audioBuffer = await axios.get(json.download_url, {
      responseType: "arraybuffer"
    }).then(res => res.data);

    await sock.sendMessage(m.key.remoteJid, {
      audio: { buffer: audioBuffer },
      mimetype: "audio/mp4",
      ptt: false
    }, { quoted: m });

  } catch (e) {
    console.error("Spotify Audio Send Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء إرسال الأغنية. جرب مجددًا.", m);
  }
}

if (command === "!apk") {
  const appName = args.slice(1).join(" ");
  if (!appName) return fancyReply(m.key.remoteJid, "📱 أرسل اسم التطبيق بعد الأمر:\n```!apk WhatsApp```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v2/apk-dl?text=${encodeURIComponent(appName)}`);
    const json = await res.json();

    if (!json || !json.dllink) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من العثور على التطبيق. تأكد من كتابة الاسم بشكل صحيح.", m);
    }

    const caption = `
📱 *${json.name}*
📦 Package: \`${json.package}\`
📏 الحجم: ${json.size}
🕒 آخر تحديث: ${json.lastUpdate}
🔗 [تحميل مباشر](${json.dllink})
    `.trim();

    await sock.sendMessage(m.key.remoteJid, {
      image: { url: json.icon },
      caption,
      linkPreview: false
    }, { quoted: m });

  } catch (e) {
    console.error("APK Download Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب التطبيق. حاول مرة أخرى لاحقًا.", m);
  }
}

if (command === "!ytmp3") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "🎧 أرسل رابط يوتيوب بعد الأمر هكذا:\n```!ytmp3 https://youtube.com/...```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v3/ytmp3?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    
    console.log("رد API:", data); // ⚠️ طباعة لتشخيص المشكلة

    if (!data || !data.url) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من استخراج رابط الصوت من الفيديو. ربما الرابط غير مدعوم أو انتهت صلاحية الخدمة.", m);
    }

    await sock.sendMessage(m.key.remoteJid, {
      audio: { url: data.url },
      mimetype: 'audio/mp4',
      ptt: false,
      fileName: `${data.title || "youtube_audio"}.mp3`
    }, { quoted: m });

  } catch (e) {
    console.error("خطأ أثناء جلب صوت من يوتيوب:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء التحميل من يوتيوب، تحقق من الرابط أو حاول لاحقًا.", m);
  }
}
    if (command === "!weather") {
  const city = args.slice(1).join(" ");
  if (!city) return fancyReply(m.key.remoteJid, "🌍 أرسل اسم المدينة بعد الأمر\nمثال: !weather cairo", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v2/clima-s?city=${encodeURIComponent(city)}`);
    const json = await res.json();

    if (!json || !json.cidade) return fancyReply(m.key.remoteJid, "❌ لم أتمكن من العثور على هذه المدينة.", m);

    const replyText = `🌤️ حالة الطقس في *${json.cidade}*:\n\n📍 الحالة: ${json.descricao}\n🌡️ الحرارة: ${json.temperatura}\n💧 الرطوبة: ${json.umidade}\n💨 الرياح: ${json.vento}`;

    fancyReply(m.key.remoteJid, replyText, m);

  } catch (err) {
    console.error(err);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب حالة الطقس.", m);
  }
}

//if (command === "!lyrics") {
  //const query = args.slice(1).join(" ");
  //if (!query) return fancyReply(m.key.remoteJid, "🎵 أرسل اسم الأغنية بعد الأمر للبحث عن كلماتها\nمثال: !lyrics shape of you", m);

 // y {
   // const res = await fetch(`https://api.dorratz.com/v3/lyrics?query=${encodeURIComponent(query)}`, {
     // headers: {
       // 'User-Agent': 'Mozilla/5.0'
     // }
   // });

   // const contentType = res.headers.get("content-type");
 // if (!contentType || !contentType.includes("application/json")) {
   //   return fancyReply(m.key.remoteJid, "⚠️ لم أستطع قراءة البيانات. قد تكون الاستجابة غير صالحة (ليست JSON).", m);
  //  }

    //const json = await res.json();

   // if (!json.lyrics) {
     // return fancyReply(m.key.remoteJid, "❌ لم أجد كلمات الأغنية المطلوبة، حاول باسم مختلف.", m);
   // }

   // await fancyReply(m.key.remoteJid, `🎤 *${json.title}* - *${json.artist}*\n\n${json.lyrics}`, m);
// } catch (err) {
  //  console.error("Lyrics fetch error:", err);
 // fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء جلب كلمات الأغنية.", m);
 // }
//}

if (command === "!facebook" || command === "!fb") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "📘 أرسل رابط فيديو فيسبوك بعد الأمر:\n```!facebook https://www.facebook.com/...```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/fbvideo?url=${encodeURIComponent(url)}`);
    const json = await res.json();

    if (!json || !json.url) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من تحميل الفيديو. تأكد من أن الرابط صحيح ومتاح للعامة.", m);
    }

    await sock.sendMessage(m.key.remoteJid, {
      video: { url: json.url },
      caption: `🎬 تم تحميل فيديو فيسبوك بنجاح بجودة ${json.quality || "عالية"}!`,
      mimetype: "video/mp4",
      thumbnail: json.thumbnail ? { url: json.thumbnail } : null
    }, { quoted: m });

  } catch (e) {
    console.error("Facebook Video Download Error:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء تحميل فيديو فيسبوك. تأكد من الرابط وحاول مرة أخرى.", m);
  }
}

if (command === "!ytsearch") {
  const query = args.slice(1).join(" ");
  if (!query) return fancyReply(m.key.remoteJid, "🔎 أرسل كلمات البحث هكذا:\n```!ytsearch Gata Only```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v3/yt-search?query=${encodeURIComponent(query)}`);
    const json = await res.json();

    if (!json.status || !json.data || json.data.length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أجد نتائج لهذا البحث!", m);
    }

    const video = json.data[0]; // أول نتيجة فقط
    const caption = `
🎬 *${video.title}*
📺 القناة: ${video.author.name}
🕒 المدة: ${video.duration}
👁️‍🗨️ المشاهدات: ${video.views.toLocaleString()}
🔗 الرابط: ${video.url}
`;

    await sock.sendMessage(m.key.remoteJid, {
      image: { url: video.thumbnail },
      caption,
    }, { quoted: m });

  } catch (err) {
    console.error("خطأ في ytsearch:", err);
    fancyReply(m.key.remoteJid, "⚠️ حصل خطأ أثناء البحث، حاول لاحقًا.", m);
  }
}

if (command === "!pinterest") {
  const query = args.slice(1).join(" ");
  if (!query) return fancyReply(m.key.remoteJid, "🔍 أرسل كلمة للبحث في بنترست:\n```!pinterest انمي فتاة```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أجد أي صور بنتائج البحث. جرب كلمة أخرى 🌸", m);
    }

    // إرسال أول 3 صور فقط
    for (let i = 0; i < Math.min(data.length, 3); i++) {
      const image = data[i].image_large_url || data[i].image_small_url;
      if (image) {
        await sock.sendMessage(m.key.remoteJid, {
          image: { url: image },
          caption: `📌 نتيجة بحث ${i + 1} لـ: *${query}*`,
        }, { quoted: m });
      }
    }

  } catch (e) {
    console.error("❌ خطأ أثناء البحث في Pinterest:", e);
    fancyReply(m.key.remoteJid, "⚠️ حصل خطأ أثناء جلب الصور من بنترست، حاول لاحقًا!", m);
  }
}

else if (command === "!aptoide") {
  const name = args.slice(1).join(" ");
  if (!name) return fancyReply(m.key.remoteJid, "📲 أرسل اسم التطبيق بعد الأمر", m);
  const res = await fetch(`https://api.starlights.uk/api/downloader/aptoide?text=${encodeURIComponent(name)}`);
  const json = await res.json();
  if (!json.result || !json.result.link) return fancyReply(m.key.remoteJid, "❌ لم أجد التطبيق", m);
  await sock.sendMessage(m.key.remoteJid, {
    document: { url: json.result.link },
    mimetype: 'application/vnd.android.package-archive',
    fileName: `${json.result.name}.apk`
  }, { quoted: m });
}

if (command === "!tiktok") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "🎵 أرسل رابط فيديو من تيك توك بعد الأمر:\n```!tiktok https://www.tiktok.com/...```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/v2/tiktok-dl?url=${encodeURIComponent(url)}`);
    const json = await res.json();

    console.log("رد TikTok:", json); // للتشخيص

    if (!json || !json.data || !json.data.media || !json.data.media.hd) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من تحميل الفيديو، تأكد من الرابط أو جرب لاحقًا.", m);
    }

    const videoUrl = json.data.media.hd || json.data.media.org || json.data.media.wm;
    const caption = `🎬 *${json.data.title || "بدون عنوان"}*\n👤 بواسطة: ${json.data.author.nickname || "مجهول"}\n📥 التنزيل من تيك توك ~`;

    await sock.sendMessage(m.key.remoteJid, {
      video: { url: videoUrl },
      mimetype: "video/mp4",
      caption,
    }, { quoted: m });

  } catch (e) {
    console.error("خطأ أثناء تحميل فيديو TikTok:", e);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء تحميل الفيديو، تأكد من الرابط أو حاول لاحقًا!", m);
  }
}

if (command === "!instagram") {
  const url = args[1];
  if (!url) return fancyReply(m.key.remoteJid, "📸 أرسل رابط منشور إنستغرام بعد الأمر:\n```!instagram https://www.instagram.com/...```", m);

  try {
    const res = await fetch(`https://api.dorratz.com/igdl?url=${encodeURIComponent(url)}`);
    const json = await res.json();

    if (!json || !json.data || json.data.length === 0) {
      return fancyReply(m.key.remoteJid, "❌ لم أجد أي محتوى في هذا الرابط، تأكد من أنه صحيح ومتاح للعامة.", m);
    }

    for (const item of json.data) {
      const isVideo = item.url.includes(".mp4");

      // 1. أرسل المحتوى أولاً (فيديو/صورة)
      await sock.sendMessage(m.key.remoteJid, {
        [isVideo ? "video" : "image"]: { url: item.url },
        mimetype: isVideo ? "video/mp4" : "image/jpeg"
      }, { quoted: m });

      // 2. أرسل رسالة منفصلة فيها الرابط أو تفاصيل، بدون معاينة
      await sock.sendMessage(m.key.remoteJid, {
        text: `📥 تم تحميل هذا ${isVideo ? "الفيديو" : "الصورة"} من إنستغرام.\n🌐 الرابط: ${url}`,
        linkPreview: false
      }, { quoted: m });
    }

  } catch (err) {
    console.error("Instagram Download Error:", err);
    fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء تحميل منشور إنستغرام. جرب مرة أخرى أو تحقق من الرابط.", m);
  }
}

else if (command === "!gpt") {
  const text = args.slice(1).join(" ");
  if (!text) return fancyReply(m.key.remoteJid, "🧠 اكتب سؤالك بعد الأمر !gpt", m);
  const res = await fetch(`https://api.starlights.uk/api/ai/chatgpt?text=${encodeURIComponent(text)}`);
  const json = await res.json();
  await fancyReply(m.key.remoteJid, `🤖 *GPT رد:*\n${json.result}`, m);
}

else if (command === "!deep") {
  const prompt = args.slice(1).join(" ");
  if (!prompt) return fancyReply(m.key.remoteJid, "🧠 اكتب سؤالك بعد الأمر !deep", m);

  try {
    const res = await fetch(`https://api.dorratz.com/ai/deepseek?prompt=${encodeURIComponent(prompt)}`);
    const json = await res.json();

    if (!json.result) {
      return fancyReply(m.key.remoteJid, "❌ لم أتمكن من الحصول على رد من DeepSeek", m);
    }

    await fancyReply(m.key.remoteJid, `🧠 *DeepSeek رد:*\n${json.result}`, m);
  } catch (e) {
    console.error("❌ خطأ أثناء استدعاء DeepSeek:", e.message);
    return fancyReply(m.key.remoteJid, "⚠️ حدث خطأ أثناء استدعاء الذكاء الاصطناعي", m);
  }
}

else if (command === "!venice") {
  const text = args.slice(1).join(" ");
  if (!text) return fancyReply(m.key.remoteJid, "💬 اكتب ما تريد قوله لفينيسيا بعد الأمر !venice", m);
  const res = await fetch(`https://api.starlights.uk/api/ai/venice?text=${encodeURIComponent(text)}`);
  const json = await res.json();
  await fancyReply(m.key.remoteJid, `🧚‍♀️ *فينيسيا تقول:*\n${json.result}`, m);
}

    // مطور
    // أمر !ping
if (command === "!ping") {
  return fancyReply(m.key.remoteJid, "البوت شغال بكل طاقته يا سينباي!", m);
}

// أمر !restart (للمطور فقط)
if (command === "!restart" && sender === OWNER) {
  await fancyReply(m.key.remoteJid, "♻️ جارٍ إعادة تشغيل البوت... أريجاتو سينباي!", m);
  process.exit(0);
}

// أمر !owner - يعرض رقم المطور كجهة اتصال واتساب حقيقية
if (command === "!owner") {
  return sock.sendMessage(m.key.remoteJid, {
    contacts: {
      displayName: "مطور ساكورا-تشان 🌸",
      contacts: [
        {
          vcard: `
BEGIN:VCARD
VERSION:3.0
FN: مطور ساكورا-تشان 🌸
ORG: فريق ساكورا؛
TEL;type=CELL;type=VOICE;waid=249996948250:+249 99 694 8250
END:VCARD
          `.trim()
        }
      ]
    }
  }, { quoted: m });
}

// أمر !contactdev - يعرض وسائل التواصل مع المطور
if (command === "!contactdev") {
  return fancyReply(m.key.remoteJid, `
👨‍💻 *مطور ساكورا-تشان الرسمي:*
• 📞 الرقم: [اضغط هنا](https://wa.me/249996948250)
• 📢 قناة التحديثات: https://t.me/sakura_news
• 👥 مجموعة الدعم: https://chat.whatsapp.com/XXXXXXXXXXXXX

✉️ راسل المطور لأي اقتراح أو مشكلة، ساكورا-تشان بجانبك دائمًا! 🌸
`, m);
}

    if (command === "!menu") {
  return sock.sendMessage(m.key.remoteJid, {
    image: { url: "https://i.ibb.co/3yd8YBsR/d0c04cc1dc284a94d14fce6e7fc0020c.jpg" },
    caption: `
*📡 رسالة من ساكورا-تشان الرسمية - واتساب الموثّق ✅*

🌸 *كونيتشوا سينباي!* أنا *ساكورا-تشان*، مساعدتك اللطيفة! 💖
إليك قائمتي الكاملة والمحدثة:

🛠️ *أوامر الإدارة:*
• !kick @
• !amibotadmin
• !isadmin
• !promote @
• !demote @
• !setdesc [وصف]
• !revoke 
• !sticker
• !tagadmins
• !mute
• !unmute
• !kickall
• !setpp
• !tagmsg
• !tagall

📥 *أوامر التحميل:*
• !lyrics [ بحث عن كلمات اغنية]
• !song [اسم الأغنية]
• !yt [رابط يوتيوب]
• !ytsearch [بحث يوتيوب]
• !facebook [رابط]
• !pinterest [نص]
• !apk  [اسم التطبيق]
• !instagram
• !tiktok
• !spotify
• !gif

🧠 *ذكاء اصطناعي:*
• !gpt [سؤالك]
• !venice [رسالتك إلى فينيسيا]
• !deep

⚙️ *أوامر المطور:*
• !ping
• !restart
• !owner [ لتواصل مع المطور]
• !contactdev

 ⛈️ *عرض حاله الطقس في المدن*
• !weather
• !طقس

🌺 أرسل أي أمر وسأكون هنا لمساعدتك يا سينباي ~ 💕
`.trim(),
    footer: "ساكورا-تشان - مساعدتك الأنثوية الكيوت 💌",
    buttons: [
      { buttonId: "!song Kimi no Na wa", buttonText: { displayText: "🎶 أغنية" }, type: 1 },
      { buttonId: "!ytsearch anime opening", buttonText: { displayText: "🔎 بحث يوتيوب" }, type: 1 },
      { buttonId: "!gpt ما معنى الحياة؟", buttonText: { displayText: "🤖 اسأل ساكورا" }, type: 1 },
    ],
    headerType: 4 // صورة
  }, { quoted: m });
}

    if (command === "!ask") {
      const questions = [
        "ما هو لونك المفضل؟",
        "هل تحب القطط أم الكلاب؟",
        "ماذا ستفعل لو أصبحت بطل أنمي؟",
        "من هو شخصك المفضل في ون بيس؟",
        "هل تؤمن بالحب من أول نظرة؟",
        "ما هو حلمك الأكبر؟"
      ];
      const q = questions[Math.floor(Math.random() * questions.length)];
      return fancyReply(m.key.remoteJid, `سؤالي لك يا سينباي:\n\n*${q}*`, m);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    try {
      for (const user of update.participants) {
        const pp = await sock.profilePictureUrl(user, 'image').catch(() => null);
        if (update.action === "add") {
          await sock.sendMessage(update.id, {
            image: { url: pp || "https://i.ibb.co/album/default.jpg" },
            caption: `ياهلا <@${user.split("@")[0]}>! أنا ساكورا-تشان أرحب بك! نتمنى لك وقتاً ممتعاً معنا، ولا تنسَ تجربة الأوامر المسلية بكتابة !menu`,
            mentions: [user]
          });
        } else if (update.action === "remove") {
          await sock.sendMessage(update.id, {
            text: `مع السلامة <@${user.split("@")[0]}>! سنفتقدك كثيراً... إن احتجتني مجدداً، ستجدني بانتظارك!`,
            mentions: [user]
          });
        }
      }
    } catch (e) {
      console.log("خطأ في الترحيب أو المغادرة:", e);
    }
  });
}

startBot();
