const { Telegraf } = require('telegraf');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDocs, updateDoc, query, where, deleteDoc } = require('firebase/firestore');
const moment = require('moment');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA_L2snplEittad-12qK77YXKktleYIdGo",
    authDomain: "shaxati-26f60.firebaseapp.com",
    projectId: "shaxati-26f60",
    storageBucket: "shaxati-26f60.firebasestorage.app",
    messagingSenderId: "790682730634",
    appId: "1:790682730634:web:99c114b4e8bc989f646d73",
    measurementId: "G-KWJ4MPL0J0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Bot token and configuration
const bot = new Telegraf('7942798139:AAEyX1V8Yktht6oGeiUJLkOqHzQyIc04uKs');
const ADMIN_ID = 5483526431;
const PRIVATE_CHANNEL_ID = -1002473076839;
const STATIC_CHANNEL_LINK = 'https://t.me/rereadc'; // Your channel's static link
const START_IMAGE = 'https://res.cloudinary.com/dodw9wq5x/image/upload/v1751482696/photo_2025-07-03_00-03-03_hkgglk.jpg'; // Replace with your image file_id or URL

// Initialize tariffs
async function initTariffs() {
    try {
        const tariffsRef = collection(db, 'tariffs');
        await setDoc(doc(tariffsRef, 'weekly'), {
            tariff_name: 'weekly',
            description: 'Haftalik obuna 99  ming uzs',
            price: 10.0,
            duration_days: 7
        });
        await setDoc(doc(tariffsRef, 'monthly'), {
            tariff_name: 'monthly',
            description: 'Oylik obuna 199 ming uzs',
            price: 30.0,
            duration_days: 30
        });
        await setDoc(doc(tariffsRef, 'vip'), {
            tariff_name: 'vip',
            description: 'VIP obuna 299 ming uzs',
            price: 100.0,
            duration_days: 365
        });
        console.log('Tariffs initialized');
    } catch (error) {
        console.error('Error initializing tariffs:', error);
    }
}

// /start command
bot.command('start', async (ctx) => {
    try {
        const tariffsRef = collection(db, 'tariffs');
        const snapshot = await getDocs(tariffsRef);
        const tariffs = snapshot.docs.map(doc => doc.data());
        const keyboard = {
            inline_keyboard: tariffs.map(tariff => [
                { text: tariff.description, callback_data: tariff.tariff_name }
            ])
        };
        const caption = 'Obuna turini tanlang:'; // Short caption, as tariffs are in the image
        await ctx.replyWithPhoto(START_IMAGE, { caption, reply_markup: keyboard });
        console.log(`Start command executed for user ${ctx.from.id}`);
    } catch (error) {
        console.error('Error in /start:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
});

// Handle tariff selection
bot.action(['weekly', 'monthly', 'vip'], async (ctx) => {
    try {
        const tariff = ctx.match[0];
        await setDoc(doc(db, 'temp_selections', ctx.from.id.toString()), {
            user_id: ctx.from.id,
            selected_tariff: tariff,
            timestamp: moment().toISOString()
        }, { merge: true });
        await ctx.answerCbQuery();
        await ctx.reply('To\'lovni shu 4073420049274529 kartaga tashang\nТ. Иzzat\nIltimos, to\'lov kvitansiyasi fotosuratini yuboring.');
        console.log(`User ${ctx.from.id} selected tariff: ${tariff}`);
    } catch (error) {
        console.error('Error in tariff selection:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
});

// Handle cheque photo
bot.on('photo', async (ctx) => {
    try {
        const user = ctx.from;
        const tempSelectionDoc = await getDocs(query(collection(db, 'temp_selections'), where('user_id', '==', user.id)));
        const tempSelection = tempSelectionDoc.docs[0]?.data();

        if (!tempSelection || !tempSelection.selected_tariff) {
            await ctx.reply('Iltimos, avval /start orqali tarifni tanlang');
            console.log(`User ${user.id} sent photo without selecting tariff`);
            return;
        }

        const tariff = tempSelection.selected_tariff;
        const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const requestTime = moment().toISOString();

        await setDoc(doc(collection(db, 'requests')), {
            user_id: user.id,
            tariff,
            request_time: requestTime,
            cheque_photo: photo,
            status: 'pending'
        });

        // Delete temporary selection
        await deleteDoc(doc(db, 'temp_selections', user.id.toString()));

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Tasdiqlash', callback_data: `approve_${user.id}_${tariff}` },
                    { text: 'Rad etish', callback_data: `reject_${user.id}_${tariff}` }
                ]
            ]
        };
        await ctx.reply('Kuting, biz sizning chekingizni tekshirmoqdamiz, adminlarimiz tasdiqlaydi.');
        await bot.telegram.sendPhoto(
            ADMIN_ID,
            photo,
            {
                caption: `@${user.username || 'User' + user.id} dan yangi so'rov\nTarif: ${tariff}\nVaqt: ${requestTime}`,
                reply_markup: keyboard
            }
        ).catch(error => {
            console.error('Error sending photo to admin:', error);
            ctx.reply('Kvitansiyani adminga yuborish muvaffaqiyatsiz tugadi. Iltimos, qayta urinib ko\'ring.');
        });
        console.log(`Receipt from user ${user.id} sent to admin for tariff ${tariff}`);
    } catch (error) {
        console.error('Error handling photo:', error);
        await ctx.reply('Kvitansiyangizni qayta ishlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
});

// Handle admin decisions
bot.action(/^(approve|reject)_(\d+)_(\w+)$/, async (ctx) => {
    try {
        const [_, action, userId, tariff] = ctx.match;
        console.log(`Processing ${action} for user ${userId}, tariff: ${tariff}`);
        await ctx.answerCbQuery();

        const tariffsRef = collection(db, 'tariffs');
        const tariffDoc = await getDocs(query(tariffsRef, where('tariff_name', '==', tariff)));
        if (tariffDoc.empty) {
            console.error(`Tariff ${tariff} not found`);
            await ctx.reply('Xato: Tarif topilmadi.');
            return;
        }
        const duration = tariffDoc.docs[0].data().duration_days;
        console.log(`Tariff ${tariff} found, duration: ${duration} days`);

        if (action === 'approve') {
            const expiryDate = moment().add(duration, 'days').toISOString();
            console.log(`Setting user ${userId} subscription: expiry=${expiryDate}`);
            await setDoc(doc(db, 'users', userId.toString()), {
                user_id: parseInt(userId),
                username: ctx.from.username || `User${userId}`,
                tariff,
                expiry_date: expiryDate,
                status: 'active'
            }, { merge: true });
            console.log(`User ${userId} subscription saved to Firestore`);

            const requestsRef = collection(db, 'requests');
            const requestQuery = query(requestsRef, where('user_id', '==', parseInt(userId)), where('tariff', '==', tariff), where('status', '==', 'pending'));
            const requestSnapshot = await getDocs(requestQuery);
            if (requestSnapshot.empty) {
                console.warn(`No pending request found for user ${userId}, tariff: ${tariff}`);
            } else {
                requestSnapshot.forEach(async (requestDoc) => {
                    await updateDoc(doc(requestsRef, requestDoc.id), { status: 'approved', comment: 'Approved' });
                });
                console.log(`Updated request status to approved for user ${userId}`);
            }

            try {
                console.log(`Attempting to send static channel link to user ${userId}: ${STATIC_CHANNEL_LINK}`);
                await bot.telegram.sendMessage(userId, `Sizning obunangiz tasdiqlandi! Maxsus kanalga qo'shiling: ${STATIC_CHANNEL_LINK}`);
                console.log(`Approved subscription for user ${userId}, tariff: ${tariff}, static link sent: ${STATIC_CHANNEL_LINK}`);
            } catch (error) {
                console.error('Error sending channel link:', error);
                await bot.telegram.sendMessage(userId, 'Sizning obunangiz tasdiqlandi, lekin kanal havolasini taqdim eta olmadik. Iltimos, qo\'llab-quvvatlash xizmatiga murojaat qiling.');
                await ctx.reply(`Approved user ${userId}, but failed to send channel link: ${error.message}`);
            }
        } else {
            const requestsRef = collection(db, 'requests');
            const requestQuery = query(requestsRef, where('user_id', '==', parseInt(userId)), where('tariff', '==', tariff), where('status', '==', 'pending'));
            const requestSnapshot = await getDocs(requestQuery);
            if (requestSnapshot.empty) {
                console.warn(`No pending request found for user ${userId}, tariff: ${tariff}`);
            } else {
                requestSnapshot.forEach(async (requestDoc) => {
                    await updateDoc(doc(requestsRef, requestDoc.id), { status: 'rejected', comment: 'Receipt rejected' });
                });
            }
            await bot.telegram.sendMessage(userId, 'Sizning kvitansiyangiz rad etildi. Sabab: Kvitansiya tasdiqlanmadi.');
            console.log(`Rejected subscription for user ${userId}, tariff: ${tariff}`);
        }

        await ctx.reply('Qaror qayta ishlangan.');
    } catch (error) {
        console.error('Error in admin decision:', error);
        await ctx.reply(`Qaror qayta ishlashda xatolik yuz berdi: ${error.message}`);
    }
});

// /status command
bot.command('status', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userDoc = await getDocs(query(collection(db, 'users'), where('user_id', '==', userId)));
        const userData = userDoc.docs[0]?.data();

        if (userData) {
            await ctx.reply(`Sizning tarifingiz: ${userData.tariff}\nAmal qilish muddati: ${userData.expiry_date}\nHolati: ${userData.status === 'active' ? 'faol' : 'muddati tugagan'}`);
        } else {
            await ctx.reply('Sizda faol obuna yo\'q.');
        }
        console.log(`Status checked for user ${userId}`);
    } catch (error) {
        console.error('Error in /status:', error);
        await ctx.reply('Sizning holatingizni tekshirishda xatolik yuz berdi.');
    }
});

// Check subscription expirations
async function checkSubscriptions() {
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(query(usersRef, where('status', '==', 'active')));
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const currentTime = moment();

        for (const user of users) {
            const expiry = moment(user.expiry_date);
            if (currentTime.isSameOrAfter(expiry)) {
                await updateDoc(doc(db, 'users', user.id), { status: 'expired' });
                await bot.telegram.banChatMember(PRIVATE_CHANNEL_ID, user.user_id).catch(error => {
                    console.error(`Error banning user ${user.user_id}:`, error);
                });
                await bot.telegram.sendMessage(user.user_id, 'Sizning obunangiz muddati tugadi.').catch(error => {
                    console.error(`Error notifying user ${user.user_id}:`, error);
                });
                console.log(`Expired subscription for user ${user.user_id}`);
            } else if (currentTime.isSameOrAfter(moment(user.expiry_date).subtract(2, 'days'))) {
                await bot.telegram.sendMessage(user.user_id, `Sizning ${user.tariff} obunangiz 2 kundan so'ng tugaydi.`).catch(error => {
                    console.error(`Error sending reminder to user ${user.user_id}:`, error);
                });
                console.log(`Sent expiration reminder to user ${user.user_id}`);
            }
        }
    } catch (error) {
        console.error('Error in checkSubscriptions:', error);
    }
}

// Run subscription check daily
setInterval(checkSubscriptions, 24 * 60 * 60 * 1000);

// Start the bot
async function main() {
    try {
        await initTariffs();
        await bot.launch();
        // Check bot and channel status
        const botInfo = await bot.telegram.getMe();
        console.log(`Bot info: ID=${botInfo.id}, Username=@${botInfo.username}`);
        bot.telegram.getChat(PRIVATE_CHANNEL_ID).then(chat => {
            console.log(`Channel verified: ID=${chat.id}, Title=${chat.title}`);
        }).catch(error => {
            console.error('Error verifying channel ID:', error);
        });
        console.log('Bot is running...');
    } catch (error) {
        console.error('Error starting bot:', error);
    }
}

main().catch(console.error);

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));