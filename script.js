// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Глобальное состояние игры
const gameState = {
    players: [
        { name: 'Игрок 1', scores: [], avg: 0 },
        { name: 'Игрок 2', scores: [], avg: 0 }
    ],
    currentPlayer: 0,
    currentRound: 1,
    originalColor: null,
    timerInterval: null,
    waitingForNext: false
};

// DOM элементы
const screens = {
    menu: document.getElementById('menuScreen'),
    rules: document.getElementById('rulesScreen'),
    game: document.getElementById('gameScreen'),
    results: document.getElementById('resultsScreen')
};

// Элементы игры
const gameElements = {
    turnIndicator: document.getElementById('turnIndicator'),
    currentRound: document.getElementById('currentRound'),
    showBlock: document.getElementById('showColorBlock'),
    guessBlock: document.getElementById('guessBlock'),
    resultBlock: document.getElementById('resultBlock'),
    targetColor: document.getElementById('targetColor'),
    timerNumber: document.getElementById('timerNumber'),
    currentColor: document.getElementById('currentColor'),
    hueSlider: document.getElementById('hueSlider'),
    satSlider: document.getElementById('satSlider'),
    briSlider: document.getElementById('briSlider'),
    hueValue: document.getElementById('hueValue'),
    satValue: document.getElementById('satValue'),
    briValue: document.getElementById('briValue'),
    submitBtn: document.getElementById('submitBtn'),
    nextRoundBtn: document.getElementById('nextRoundBtn'),
    originalSwatch: document.getElementById('originalSwatch'),
    playerSwatch: document.getElementById('playerSwatch'),
    accuracyPercent: document.getElementById('accuracyPercent')
};

// HSV to RGB конвертация
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

// Получить случайный цвет
function getRandomColor() {
    return {
        h: Math.floor(Math.random() * 360),
        s: 50 + Math.floor(Math.random() * 50),
        v: 60 + Math.floor(Math.random() * 40)
    };
}

// Рассчитать точность
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

// Обновить превью текущего цвета
function updateCurrentColor() {
    const h = parseInt(gameElements.hueSlider.value);
    const s = parseInt(gameElements.satSlider.value);
    const v = parseInt(gameElements.briSlider.value);
    
    gameElements.hueValue.textContent = h + '°';
    gameElements.satValue.textContent = s + '%';
    gameElements.briValue.textContent = v + '%';
    
    const rgb = hsvToRgb(h, s, v);
    gameElements.currentColor.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

// Показать цвет для запоминания
function showMemorizeColor() {
    clearTimer();
    
    const color = getRandomColor();
    gameState.originalColor = color;
    const rgb = hsvToRgb(color.h, color.s, color.v);
    gameElements.targetColor.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    
    gameElements.showBlock.style.display = 'block';
    gameElements.guessBlock.style.display = 'none';
    gameElements.resultBlock.style.display = 'none';
    
    let timeLeft = 3;
    gameElements.timerNumber.textContent = timeLeft;
    
    gameState.timerInterval = setInterval(() => {
        timeLeft--;
        gameElements.timerNumber.textContent = timeLeft >= 0 ? timeLeft : 0;
        
        if (timeLeft < 0) {
            clearTimer();
            startGuessingPhase();
        }
    }, 1000);
}

// Начать фазу угадывания
function startGuessingPhase() {
    gameElements.showBlock.style.display = 'none';
    gameElements.guessBlock.style.display = 'block';
    
    // Сброс ползунков
    gameElements.hueSlider.value = 0;
    gameElements.satSlider.value = 100;
    gameElements.briSlider.value = 100;
    updateCurrentColor();
}

// Отправить ответ
function submitGuess() {
    if (gameState.waitingForNext) return;
    
    clearTimer();
    
    const h = parseInt(gameElements.hueSlider.value);
    const s = parseInt(gameElements.satSlider.value);
    const v = parseInt(gameElements.briSlider.value);
    const guessedRgb = hsvToRgb(h, s, v);
    const originalRgb = hsvToRgb(
        gameState.originalColor.h,
        gameState.originalColor.s,
        gameState.originalColor.v
    );
    
    const accuracy = calculateAccuracy(originalRgb, guessedRgb);
    gameState.players[gameState.currentPlayer].scores.push(accuracy);
    
    // Показать результат
    gameElements.guessBlock.style.display = 'none';
    gameElements.resultBlock.style.display = 'block';
    
    gameElements.originalSwatch.style.backgroundColor = `rgb(${originalRgb.r}, ${originalRgb.g}, ${originalRgb.b})`;
    gameElements.playerSwatch.style.backgroundColor = `rgb(${guessedRgb.r}, ${guessedRgb.g}, ${guessedRgb.b})`;
    gameElements.accuracyPercent.textContent = `${accuracy}%`;
    
    gameState.waitingForNext = true;
}

// Следующий раунд
function nextRound() {
    if (!gameState.waitingForNext) return;
    gameState.waitingForNext = false;
    
    gameState.currentRound++;
    
    if (gameState.currentRound > 5) {
        // Переключить игрока
        if (gameState.currentPlayer === 0) {
            gameState.currentPlayer = 1;
            gameState.currentRound = 1;
            gameElements.turnIndicator.textContent = 'Ход: Игрок 2';
            gameElements.currentRound.textContent = '1';
            showMemorizeColor();
        } else {
            // Игра окончена
            showResults();
        }
    } else {
        gameElements.currentRound.textContent = gameState.currentRound;
        showMemorizeColor();
    }
}

// Показать результаты
function showResults() {
    // Вычислить средние
    gameState.players.forEach(player => {
        if (player.scores.length > 0) {
            player.avg = player.scores.reduce((a, b) => a + b, 0) / player.scores.length;
        } else {
            player.avg = 0;
        }
    });
    
    // Построить таблицу результатов
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = `
        <div class="score-row" style="font-weight: bold; background: var(--secondary-bg);">
            <span>Игрок</span>
            <span>Точность</span>
            <span>Лучший раунд</span>
        </div>
        ${gameState.players.map((player, idx) => `
            <div class="score-row ${player.avg > gameState.players[1 - idx].avg ? 'winner' : ''}">
                <span>${player.name}</span>
                <span><strong>${player.avg.toFixed(2)}%</strong></span>
                <span>${Math.max(...player.scores).toFixed(1)}%</span>
            </div>
        `).join('')}
    `;
    
    const winnerMsg = document.getElementById('winnerMessage');
    if (gameState.players[0].avg > gameState.players[1].avg) {
        winnerMsg.textContent = '🏆 Победил Игрок 1! 🏆';
    } else if (gameState.players[1].avg > gameState.players[0].avg) {
        winnerMsg.textContent = '🏆 Победил Игрок 2! 🏆';
    } else {
        winnerMsg.textContent = '🤝 Ничья! Отличная игра! 🤝';
    }
    
    screens.game.classList.remove('active');
    screens.results.classList.add('active');
}

// Сброс игры
function resetGame() {
    clearTimer();
    gameState.players = [
        { name: 'Игрок 1', scores: [], avg: 0 },
        { name: 'Игрок 2', scores: [], avg: 0 }
    ];
    gameState.currentPlayer = 0;
    gameState.currentRound = 1;
    gameState.waitingForNext = false;
    
    gameElements.turnIndicator.textContent = 'Ход: Игрок 1';
    gameElements.currentRound.textContent = '1';
    gameElements.showBlock.style.display = 'block';
    gameElements.guessBlock.style.display = 'none';
    gameElements.resultBlock.style.display = 'none';
}

// Начать новую игру
function startGame() {
    resetGame();
    screens.menu.classList.remove('active');
    screens.game.classList.add('active');
    showMemorizeColor();
}

// Очистить таймер
function clearTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

// Обработчики событий
document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('rulesBtn').addEventListener('click', () => {
    screens.menu.classList.remove('active');
    screens.rules.classList.add('active');
});
document.getElementById('backFromRules').addEventListener('click', () => {
    screens.rules.classList.remove('active');
    screens.menu.classList.add('active');
});
document.getElementById('playAgainBtn').addEventListener('click', () => {
    screens.results.classList.remove('active');
    startGame();
});
document.getElementById('menuBtn').addEventListener('click', () => {
    screens.results.classList.remove('active');
    screens.menu.classList.add('active');
});

gameElements.submitBtn.addEventListener('click', submitGuess);
gameElements.nextRoundBtn.addEventListener('click', nextRound);
gameElements.hueSlider.addEventListener('input', updateCurrentColor);
gameElements.satSlider.addEventListener('input', updateCurrentColor);
gameElements.briSlider.addEventListener('input', updateCurrentColor);

// Сообщить Telegram, что приложение готово
tg.ready();