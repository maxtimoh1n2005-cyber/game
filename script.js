// Firebase конфигурация (ЗАМЕНИТЕ НА ВАШУ!)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Глобальные переменные
let currentGameId = null;
let currentPlayerId = null;
let playerNumber = null; // 0 - создатель, 1 - присоединившийся
let gameState = {
    players: [],
    currentTurn: 0,
    round: 1,
    gameActive: true,
    currentColor: null,
    waitingForNext: false
};

let localGameData = {
    scores: [],
    currentRound: 1,
    timerInterval: null,
    originalColor: null
};

// DOM элементы
const screens = {
    menu: document.getElementById('menuScreen'),
    waiting: document.getElementById('waitingScreen'),
    game: document.getElementById('gameScreen'),
    results: document.getElementById('resultsScreen'),
    rules: document.getElementById('rulesScreen')
};

// Генерация кода игры
function generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Создание игры
async function createGame() {
    const gameCode = generateGameCode();
    currentGameId = gameCode;
    currentPlayerId = `player_${Date.now()}_${Math.random()}`;
    playerNumber = 0;
    
    const gameData = {
        code: gameCode,
        players: {
            [currentPlayerId]: {
                name: tg.initDataUnsafe?.user?.first_name || 'Игрок 1',
                scores: [],
                ready: false,
                playerNum: 0
            }
        },
        status: 'waiting',
        currentTurn: currentPlayerId,
        round: 1,
        createdAt: Date.now()
    };
    
    await database.ref(`games/${gameCode}`).set(gameData);
    
    document.getElementById('gameCodeDisplay').textContent = gameCode;
    document.getElementById('waitingTitle').textContent = 'Ожидание соперника...';
    screens.menu.classList.remove('active');
    screens.waiting.classList.add('active');
    
    // Слушаем подключение второго игрока
    database.ref(`games/${gameCode}/players`).on('value', (snapshot) => {
        const players = snapshot.val();
        if (players && Object.keys(players).length === 2) {
            startOnlineGame();
        }
    });
}

// Присоединение к игре
function joinGame() {
    const gameCode = document.getElementById('gameCodeInput').value.toUpperCase();
    if (!gameCode) return;
    
    currentGameId = gameCode;
    currentPlayerId = `player_${Date.now()}_${Math.random()}`;
    playerNumber = 1;
    
    const gameRef = database.ref(`games/${gameCode}`);
    gameRef.once('value', (snapshot) => {
        const game = snapshot.val();
        if (!game) {
            showToast('Игра не найдена!');
            return;
        }
        
        if (game.status !== 'waiting') {
            showToast('Игра уже началась!');
            return;
        }
        
        // Добавляем второго игрока
        const updates = {};
        updates[`games/${gameCode}/players/${currentPlayerId}`] = {
            name: tg.initDataUnsafe?.user?.first_name || 'Игрок 2',
            scores: [],
            ready: false,
            playerNum: 1
        };
        
        database.ref().update(updates);
        
        screens.menu.classList.remove('active');
        screens.waiting.classList.add('active');
        document.getElementById('waitingTitle').textContent = 'Подключение...';
        
        // Ждем начала игры
        gameRef.on('value', (snapshot) => {
            const updatedGame = snapshot.val();
            if (updatedGame && updatedGame.status === 'playing') {
                startOnlineGame();
            }
        });
    });
}

// Начать онлайн-игру
function startOnlineGame() {
    screens.waiting.classList.remove('active');
    screens.game.classList.add('active');
    
    // Получаем данные игроков
    database.ref(`games/${currentGameId}/players`).once('value', (snapshot) => {
        const players = snapshot.val();
        const playerList = Object.keys(players).map(key => ({
            id: key,
            ...players[key]
        }));
        
        gameState.players = playerList;
        
        // Определяем очередность
        const myPlayer = playerList.find(p => p.id === currentPlayerId);
        const opponent = playerList.find(p => p.id !== currentPlayerId);
        
        document.getElementById('opponentName').textContent = opponent.name;
        
        // Слушаем изменения игры
        listenToGameUpdates();
        
        // Если первый игрок - начинаем первый раунд
        if (myPlayer.playerNum === 0 && gameState.currentTurn === currentPlayerId) {
            startRound();
        }
    });
}

// Слушать обновления игры
function listenToGameUpdates() {
    const gameRef = database.ref(`games/${currentGameId}`);
    
    gameRef.on('value', (snapshot) => {
        const game = snapshot.val();
        if (!game) return;
        
        // Обновляем состояние игры
        gameState.currentTurn = game.currentTurn;
        gameState.round = game.round;
        
        document.getElementById('currentRound').textContent = gameState.round;
        
        // Проверяем, чей ход
        const isMyTurn = gameState.currentTurn === currentPlayerId;
        const playerStatus = document.getElementById('playerStatus');
        
        if (isMyTurn && !localGameData.waitingForNext) {
            playerStatus.textContent = 'Ваш ход';
            playerStatus.style.background = '#4caf50';
        } else if (!isMyTurn) {
            playerStatus.textContent = 'Ход соперника';
            playerStatus.style.background = '#ff9800';
        }
        
        // Если игра завершена
        if (game.status === 'finished') {
            showOnlineResults(game);
        }
        
        // Если соперник закончил раунд и мы ждем
        if (game.waitingForNext && localGameData.waitingForNext) {
            document.getElementById('waitingOpponentMsg').style.display = 'none';
            nextRoundOnline();
        }
    });
}

// Начать раунд
function startRound() {
    localGameData.originalColor = getRandomColor();
    const rgb = hsvToRgb(localGameData.originalColor.h, localGameData.originalColor.s, localGameData.originalColor.v);
    document.getElementById('targetColor').style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    
    document.getElementById('showColorBlock').style.display = 'block';
    document.getElementById('guessBlock').style.display = 'none';
    document.getElementById('resultBlock').style.display = 'none';
    
    let timeLeft = 3;
    document.getElementById('timerNumber').textContent = timeLeft;
    
    localGameData.timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timerNumber').textContent = timeLeft >= 0 ? timeLeft : 0;
        
        if (timeLeft < 0) {
            clearInterval(localGameData.timerInterval);
            startGuessingPhase();
        }
    }, 1000);
}

// Начать фазу угадывания
function startGuessingPhase() {
    document.getElementById('showColorBlock').style.display = 'none';
    document.getElementById('guessBlock').style.display = 'block';
    
    // Сброс ползунков
    document.getElementById('hueSlider').value = 0;
    document.getElementById('satSlider').value = 100;
    document.getElementById('briSlider').value = 100;
    updateCurrentColor();
}

// Отправить результат
async function submitResult() {
    if (localGameData.waitingForNext) return;
    
    clearInterval(localGameData.timerInterval);
    
    const h = parseInt(document.getElementById('hueSlider').value);
    const s = parseInt(document.getElementById('satSlider').value);
    const v = parseInt(document.getElementById('briSlider').value);
    const guessedRgb = hsvToRgb(h, s, v);
    const originalRgb = hsvToRgb(
        localGameData.originalColor.h,
        localGameData.originalColor.s,
        localGameData.originalColor.v
    );
    
    const accuracy = calculateAccuracy(originalRgb, guessedRgb);
    localGameData.scores.push(accuracy);
    
    // Сохраняем результат в Firebase
    await database.ref(`games/${currentGameId}/players/${currentPlayerId}/scores`).set(localGameData.scores);
    
    // Показываем результат
    document.getElementById('guessBlock').style.display = 'none';
    document.getElementById('resultBlock').style.display = 'block';
    
    document.getElementById('originalSwatch').style.backgroundColor = `rgb(${originalRgb.r}, ${originalRgb.g}, ${originalRgb.b})`;
    document.getElementById('playerSwatch').style.backgroundColor = `rgb(${guessedRgb.r}, ${guessedRgb.g}, ${guessedRgb.b})`;
    document.getElementById('accuracyPercent').textContent = `${accuracy}%`;
    
    localGameData.waitingForNext = true;
    
    // Уведомляем о готовности к следующему раунду
    await database.ref(`games/${currentGameId}`).update({
        waitingForNext: true,
        playerReady: currentPlayerId
    });
    
    document.getElementById('waitingOpponentMsg').style.display = 'block';
}

// Следующий раунд онлайн
async function nextRoundOnline() {
    localGameData.waitingForNext = false;
    localGameData.currentRound++;
    
    if (localGameData.currentRound > 5) {
        // Проверяем, закончили ли оба игрока
        const playersSnapshot = await database.ref(`games/${currentGameId}/players`).once('value');
        const players = playersSnapshot.val();
        const allFinished = Object.values(players).every(p => p.scores && p.scores.length === 5);
        
        if (allFinished) {
            await database.ref(`games/${currentGameId}`).update({
                status: 'finished'
            });
        } else {
            // Передаем ход другому игроку
            const nextPlayer = gameState.players.find(p => p.id !== currentPlayerId).id;
            await database.ref(`games/${currentGameId}`).update({
                currentTurn: nextPlayer,
                round: localGameData.currentRound,
                waitingForNext: false,
                playerReady: null
            });
            
            document.getElementById('resultBlock').style.display = 'none';
            document.getElementById('waitingOpponentMsg').style.display = 'none';
            
            if (nextPlayer === currentPlayerId) {
                startRound();
            }
        }
    } else {
        // Передаем ход другому игроку
        const nextPlayer = gameState.players.find(p => p.id !== currentPlayerId).id;
        await database.ref(`games/${currentGameId}`).update({
            currentTurn: nextPlayer,
            round: localGameData.currentRound,
            waitingForNext: false,
            playerReady: null
        });
        
        document.getElementById('resultBlock').style.display = 'none';
        
        if (nextPlayer === currentPlayerId) {
            startRound();
        }
    }
}

// Показать результаты онлайн
function showOnlineResults(game) {
    screens.game.classList.remove('active');
    screens.results.classList.add('active');
    
    const players = Object.values(game.players);
    players.forEach(p => {
        p.avg = p.scores.reduce((a, b) => a + b, 0) / p.scores.length;
    });
    
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = `
        <div class="score-row" style="font-weight: bold;">
            <span>Игрок</span>
            <span>Точность</span>
            <span>Лучший раунд</span>
        </div>
        ${players.map(p => `
            <div class="score-row ${p.avg > players[1 - players.indexOf(p)].avg ? 'winner' : ''}">
                <span>${p.name}</span>
                <span><strong>${p.avg.toFixed(2)}%</strong></span>
                <span>${Math.max(...p.scores).toFixed(1)}%</span>
            </div>
        `).join('')}
    `;
    
    const winnerMsg = document.getElementById('winnerMessage');
    if (players[0].avg > players[1].avg) {
        winnerMsg.textContent = `🏆 Победил ${players[0].name}! 🏆`;
    } else if (players[1].avg > players[0].avg) {
        winnerMsg.textContent = `🏆 Победил ${players[1].name}! 🏆`;
    } else {
        winnerMsg.textContent = '🤝 Ничья! Отличная игра! 🤝';
    }
}

// Вспомогательные функции (HSV, RGB, точность)
function hsvToRgb(h, s, v) {
    h = (h % 360 + 360) % 360;
    s = Math.min(100, Math.max(0, s)) / 100;
    v = Math.min(100, Math.max(0, v)) / 100;
    
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let rp, gp, bp;
    
    if (h >= 0 && h < 60) { rp = c; gp = x; bp = 0; }
    else if (h >= 60 && h < 120) { rp = x; gp = c; bp = 0; }
    else if (h >= 120 && h < 180) { rp = 0; gp = c; bp = x; }
    else if (h >= 180 && h < 240) { rp = 0; gp = x; bp = c; }
    else if (h >= 240 && h < 300) { rp = x; gp = 0; bp = c; }
    else { rp = c; gp = 0; bp = x; }
    
    return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255)
    };
}

function getRandomColor() {
    return {
        h: Math.floor(Math.random() * 360),
        s: 50 + Math.floor(Math.random() * 50),
        v: 60 + Math.floor(Math.random() * 40)
    };
}

function calculateAccuracy(rgb1, rgb2) {
    const distance = Math.sqrt(
        Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
    );
    const maxDistance = Math.sqrt(255 * 255 * 3);
    const accuracy = (1 - distance / maxDistance) * 100;
    return Math.round(accuracy * 100) / 100;
}

function updateCurrentColor() {
    const h = parseInt(document.getElementById('hueSlider').value);
    const s = parseInt(document.getElementById('satSlider').value);
    const v = parseInt(document.getElementById('briSlider').value);
    
    document.getElementById('hueValue').textContent = h + '°';
    document.getElementById('satValue').textContent = s + '%';
    document.getElementById('briValue').textContent = v + '%';
    
    const rgb = hsvToRgb(h, s, v);
    document.getElementById('currentColor').style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Обработчики событий
document.getElementById('createGameBtn').addEventListener('click', createGame);
document.getElementById('joinGameBtn').addEventListener('click', () => {
    const panel = document.getElementById('joinPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('confirmJoinBtn').addEventListener('click', joinGame);
document.getElementById('cancelGameBtn').addEventListener('click', () => {
    if (currentGameId) {
        database.ref(`games/${currentGameId}`).remove();
    }
    screens.waiting.classList.remove('active');
    screens.menu.classList.add('active');
});
document.getElementById('copyCodeBtn').addEventListener('click', () => {
    const code = document.getElementById('gameCodeDisplay').textContent;
    navigator.clipboard.writeText(code);
    showToast('Код скопирован!');
});
document.getElementById('submitBtn').addEventListener('click', submitResult);
document.getElementById('nextRoundBtn').addEventListener('click', nextRoundOnline);
document.getElementById('rulesBtn').addEventListener('click', () => {
    screens.menu.classList.remove('active');
    screens.rules.classList.add('active');
});
document.getElementById('backFromRulesBtn').addEventListener('click', () => {
    screens.rules.classList.remove('active');
    screens.menu.classList.add('active');
});
document.getElementById('playAgainOnlineBtn').addEventListener('click', () => {
    screens.results.classList.remove('active');
    screens.menu.classList.add('active');
});
document.getElementById('menuFromResultsBtn').addEventListener('click', () => {
    screens.results.classList.remove('active');
    screens.menu.classList.add('active');
});

document.getElementById('hueSlider').addEventListener('input', updateCurrentColor);
document.getElementById('satSlider').addEventListener('input', updateCurrentColor);
document.getElementById('briSlider').addEventListener('input', updateCurrentColor);

tg.ready();
