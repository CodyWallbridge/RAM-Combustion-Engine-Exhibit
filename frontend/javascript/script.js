function createRipple(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    const btnRect = button.getBoundingClientRect();
    const circle = document.createElement("span");
    const diameter = Math.max(btnRect.width, btnRect.height);
    const radius = diameter / 2;
    const redButton = document.querySelector('.red-button');
    const percentageDisplay = document.getElementById('percentage-display');
    const isOnLoadingPage = percentageDisplay && percentageDisplay.textContent === 'Loading';
    const isStagePage = redButton && !isOnLoadingPage;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - (btnRect.left + radius)}px`;
    circle.style.top = `${event.clientY - (btnRect.top + radius)}px`;
    circle.classList.add("ripple");
    const existingRipples = button.getElementsByClassName("ripple");
    while (existingRipples.length > 0) {
        existingRipples[0].remove();
    }
    button.appendChild(circle);
    circle.addEventListener('animationend', () => {
        circle.remove();
    });
}

const currentPort = window.location.port || '8001';
const POLL_INTERVAL = 250;

const button = document.querySelector('.red-button');

function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

function waitForImageLoad(img, timeoutMs = 1200) {
    return new Promise((resolve, reject) => {
        const onLoad = () => {
            cleanup();
            resolve(true);
        };
        const onError = () => {
            cleanup();
            reject(new Error('error'));
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('timeout'));
        }, timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
        };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
    });
}

const blobUrlRegistry = new WeakMap();

async function ensureImageLoads(img, options = {}) {
    if (!img) return;
    const maxAttempts = options.maxAttempts || 6;
    const timeoutMs = options.timeoutMs || 3000;
    const baseSrc = img.dataset.srcOriginal || img.getAttribute('src');
    if (!baseSrc) return;
    img.dataset.srcOriginal = baseSrc;

    const isLoaded = () => img.complete && img.naturalWidth > 0;
    if (isLoaded()) return;

    let lastObjectUrl = blobUrlRegistry.get(img);

    const attachAndAwaitLoad = (url) => {
        const loadPromise = waitForImageLoad(img, timeoutMs);
        img.src = url;
        return loadPromise;
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (!img.isConnected) return;
        const bust = attempt === 1 ? '' : `${baseSrc.includes('?') ? '&' : '?'}cb=${Date.now()}-${attempt}`;
        const urlToTry = `${baseSrc}${bust}`;
        try {
            await attachAndAwaitLoad(urlToTry);
            if (lastObjectUrl) {
                URL.revokeObjectURL(lastObjectUrl);
                blobUrlRegistry.delete(img);
            }
            return;
        } catch (_) {
            try {
                const response = await fetch(urlToTry, { cache: 'no-store' });
                if (!response.ok) throw new Error(`status ${response.status}`);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                blobUrlRegistry.set(img, objectUrl);
                await attachAndAwaitLoad(objectUrl);
                if (lastObjectUrl && lastObjectUrl !== objectUrl) {
                    URL.revokeObjectURL(lastObjectUrl);
                }
                lastObjectUrl = objectUrl;
                return;
            } catch (err) {
                if (attempt === maxAttempts) {
                    console.warn(`Image failed after ${maxAttempts} attempts: ${baseSrc}`, err);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 200 * attempt));
            }
        }
    }
}

function attachRedButtonHandlers(targetButton) {
    if (!targetButton) return;
    if (targetButton.__handlersAttached) return;
    
    // Clean up any stale data attribute from previous renders
    if (targetButton.hasAttribute('data-bound')) {
        targetButton.removeAttribute('data-bound');
    }
    
    targetButton.__handlersAttached = true;
    targetButton.addEventListener('click', createRipple);
    
    let isProcessing = false;
    targetButton.addEventListener('click', function() {
        if (targetButton.disabled || isProcessing) return;
        isProcessing = true;
        targetButton.setAttribute('data-processing', 'true');
        targetButton.disabled = true;
        
        fetchWithTimeout(`http://localhost:${currentPort}/api/button/press`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, 5000)
        .then(response => response.json())
        .then(data => {
            isProcessing = false;
            targetButton.removeAttribute('data-processing');
            if (data.status === 'correct') {
                if (!targetButton.getAttribute('data-original-text')) {
                    targetButton.setAttribute('data-original-text', targetButton.textContent);
                }
                targetButton.disabled = true;
                targetButton.classList.add('button-disabled');
                targetButton.textContent = 'Correctly selected!';
                if (data.cycle_completed) {
                    suppressStageResetDuringCompletion = true;
                    if (!isCurrentlyShowingLoading && !isFadingOut && !isLoadingTransitionPending) {
                        switchToLoadingPage({ click_result: 'correct', cycle_completed: true });
                    }
                }
            } else {
                // On incorrect, lock UI until loading screen takes over to avoid flicker/reset.
                suppressStageResetDuringCompletion = true;
                if (!isCurrentlyShowingLoading && !isFadingOut && !isLoadingTransitionPending) {
                    switchToLoadingPage({ click_result: 'incorrect' });
                }
            }
            if (data.completed_stages !== undefined && !suppressStageResetDuringCompletion) {
                setTimeout(() => {
                    checkCompletedStages();
                }, 100);
            }
        })
        .catch(error => {
            console.error('Error triggering loading:', error);
            isProcessing = false;
            targetButton.removeAttribute('data-processing');
            targetButton.disabled = false;
        });
    });
}

if (button) {
    attachRedButtonHandlers(button);
}

function updatePercentage() {
    fetchWithTimeout('http://localhost:9000/api/percentage')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const percentage = data.percentage || 0;
        const displayElement = document.getElementById('percentage-display');
        const progressBar = document.getElementById('progress-bar');
        if (displayElement) {
          displayElement.textContent = Math.round(percentage) + '%';
        }
        if (progressBar) {
          progressBar.style.width = percentage + '%';
        }
      })
      .catch((error) => {
        console.error('Error fetching percentage:', error);
      });
}

function initPercentagePolling() {
  const displayElement = document.getElementById('percentage-display');
  if (displayElement) {
    console.log('Starting percentage polling...');
    updatePercentage();
    setInterval(updatePercentage, 500);
  } else {
    console.error('percentage-display element not found!');
  }
}

if (document.getElementById('percentage-display') && document.getElementById('progress-bar')) {
    initPercentagePolling();
}

let originalPageContent = null;
let isCurrentlyShowingLoading = false;
let isFadingOut = false;
let isRestoringContent = false;
let isLoadingTransitionPending = false; // Marks that loading is triggered but animation not finished
let currentStagePage = null;
let renderedStage = null;
let stageContentCache = {};
let suppressStageResetDuringCompletion = false; // Prevent flicker before loading after completing final stage
let pendingStageRefresh = false;
let loadingPollInFlight = false;
let reloadPollInFlight = false;
let completedPollInFlight = false;
let loadingEndTimestamp = null;
let loadingRestoreTimer = null;
let lastReloadState = false;

function normalizeStagePagePath(pagePath) {
    if (!pagePath) return null;
    return pagePath.startsWith('/') ? pagePath.slice(1) : pagePath;
}

async function fetchStageMainContent(stageInfo) {
    if (!stageInfo || !stageInfo.page) return null;
    
    const normalizedPath = normalizeStagePagePath(stageInfo.page);
    if (!normalizedPath) return null;
    
    if (stageContentCache[normalizedPath]) {
        return stageContentCache[normalizedPath];
    }
    
    const response = await fetch(`http://localhost:${currentPort}/${normalizedPath}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch stage page (${response.status})`);
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    if (!newMain) return null;
    
    const mainHtml = newMain.innerHTML;
    stageContentCache[normalizedPath] = mainHtml;
    return mainHtml;
}

async function renderStageContent(stageInfo, options = {}) {
    const main = document.querySelector('main');
    if (!main) return;
    
    let mainHtml = null;
    try {
        mainHtml = await fetchStageMainContent(stageInfo);
    } catch (error) {
        console.error('Error loading stage content:', error);
    }
    
    if (!mainHtml && originalPageContent) {
        mainHtml = originalPageContent;
    }
    
    if (!mainHtml) return;
    
    main.innerHTML = mainHtml;
    originalPageContent = mainHtml;
    pendingStageRefresh = false;
    
    if (stageInfo && stageInfo.stage) {
        renderedStage = stageInfo.stage;
    }
    if (stageInfo && stageInfo.page) {
        currentStagePage = stageInfo.page;
    }
    const diagramImages = Array.from(main.querySelectorAll('.diagram-image'));
    if (diagramImages.length) {
        Promise.allSettled(diagramImages.map(img => ensureImageLoads(img)))
            .catch(() => {});
    }
    
    if (options.fadeIn) {
        main.classList.add('fade-in');
        setTimeout(() => {
            main.classList.remove('fade-in');
        }, 400);
    }
    
    attachRedButtonHandlers(main.querySelector('.red-button'));
    checkCompletedStages();
}

function scheduleLoadingRestore(endTimeMs) {
    if (!endTimeMs) return;
    loadingEndTimestamp = endTimeMs;
    if (loadingRestoreTimer) {
        clearTimeout(loadingRestoreTimer);
    }
    const delay = Math.max(0, endTimeMs - Date.now());
    loadingRestoreTimer = setTimeout(() => {
        loadingRestoreTimer = null;
        restoreOriginalPage();
    }, delay);
}

function switchToLoadingPage(serverState = null) {
    if (isCurrentlyShowingLoading || isFadingOut) return; 
    isLoadingTransitionPending = true;
    const main = document.querySelector('main');
    if (main) {
        originalPageContent = main.innerHTML;
        isFadingOut = true;
        main.classList.add('fade-out');
        
        setTimeout(() => {
            main.classList.remove('fade-out');
            
            main.innerHTML = `
                <div class="percentage-container loading-fade-in">
                    <div id="label" class="label"></div>
                    <div id="percentage-display" class="percentage-display">Loading</div>
                </div>
            `;
            isCurrentlyShowingLoading = true;
            isFadingOut = false;
            isLoadingTransitionPending = false;

            if (serverState) {
                const displayElement = document.getElementById('percentage-display');
                const labelElement = document.getElementById('label');
                if (displayElement) {
                    const message = serverState.click_result === 'correct'
                        ? 'Cycle correctly completed!'
                        : serverState.click_result === 'incorrect'
                            ? 'Incorrect.'
                            : 'Loading';
                    displayElement.textContent = message;
                }
                if (serverState.click_result === 'incorrect') {
                    const label = document.getElementById('label');
                    if (label) {
                        label.textContent = "Restart cycle from stage 1!";
                    }
                } else if (serverState.cycle_completed && labelElement) {
                    labelElement.textContent = "Randomizing new cycle from stage 1";
                }
                if (serverState.loading_end_time) {
                    scheduleLoadingRestore(serverState.loading_end_time * 1000);
                }
            }
        }, 400);
    }
}

function restoreOriginalPage() {
    if (!isCurrentlyShowingLoading || isRestoringContent) return; 
    if (loadingRestoreTimer) {
        clearTimeout(loadingRestoreTimer);
        loadingRestoreTimer = null;
    }
    loadingEndTimestamp = null;
    isRestoringContent = true;
    const main = document.querySelector('main');
    if (!main) {
        isRestoringContent = false;
        return;
    }
    
    const loadingContainer = main.querySelector('.percentage-container');
    if (loadingContainer) {
        loadingContainer.classList.add('loading-fade-out');
    } else {
        main.classList.add('fade-out');
    }
    
    const stageInfoPromise = getCurrentKioskStage();
    
    setTimeout(() => {
        stageInfoPromise
            .then(stageInfo => {
                if (stageInfo) {
                    return renderStageContent(stageInfo, { fadeIn: true });
                }
                if (originalPageContent) {
                    main.innerHTML = originalPageContent;
                    attachRedButtonHandlers(main.querySelector('.red-button'));
                    checkCompletedStages();
                }
                return null;
            })
            .finally(() => {
                isCurrentlyShowingLoading = false;
                isRestoringContent = false;
                suppressStageResetDuringCompletion = false;
                isLoadingTransitionPending = false;
            });
    }, 400);
}

function checkLoadingState() {
    if (loadingPollInFlight) return;
    loadingPollInFlight = true;
    fetchWithTimeout(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            if (data.show_loading) {
                suppressStageResetDuringCompletion = true;
            }
            if (data.cycle_completed) {
                suppressStageResetDuringCompletion = true;
            }
            if (isCurrentlyShowingLoading && data.click_result) {
                const displayElement = document.getElementById('percentage-display');
                const labelElement = document.getElementById('label');
                if (displayElement) {
                    const message = data.click_result === 'correct'
                        ? 'Cycle correctly completed!'
                        : data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
                    if (displayElement.textContent !== message) {
                        displayElement.textContent = message;
                    }
                    if (data.click_result === 'incorrect') {
                        const label = document.getElementById('label');
                        if (label) {
                            label.textContent = "Restart cycle from stage 1!";
                        }
                    } else if (data.cycle_completed && labelElement) {
                        labelElement.textContent = "Randomizing new cycle from stage 1";
                    }
                }
            }
            if (data.show_loading && !isCurrentlyShowingLoading) {
                switchToLoadingPage(data);
            } else if (data.show_loading && isCurrentlyShowingLoading && data.loading_end_time) {
                scheduleLoadingRestore(data.loading_end_time * 1000);
            } else if (!data.show_loading && isCurrentlyShowingLoading) {
                restoreOriginalPage();
            } else if (!data.show_loading && isLoadingTransitionPending) {
                isLoadingTransitionPending = false;
                suppressStageResetDuringCompletion = false;
                checkCompletedStages();
            }
        })
        .catch(error => {
            console.error('Error checking loading state:', error);
        })
        .finally(() => {
            loadingPollInFlight = false;
        });
}

function checkReloadState() {
    if (reloadPollInFlight) return;
    reloadPollInFlight = true;
    fetchWithTimeout(`http://localhost:${currentPort}/api/reload`)
        .then(response => response.json())
        .then(data => {
            if (data.reload && !lastReloadState) {
                pendingStageRefresh = true;
                if (!isCurrentlyShowingLoading && !isRestoringContent) {
                    getCurrentKioskStage().then(stageInfo => {
                        if (stageInfo) {
                            renderStageContent(stageInfo, { fadeIn: true });
                        }
                    });
                }
            } else if (!data.reload && lastReloadState) {
                // Reload cycle finished
                pendingStageRefresh = false;
            }
            lastReloadState = data.reload;
        })
        .catch(error => {
            console.error('Error checking reload state:', error);
        })
        .finally(() => {
            reloadPollInFlight = false;
        });
}

let currentKioskStage = null;

function getCurrentKioskStage() {
    return fetch(`http://localhost:${currentPort}/api/stage`)
        .then(response => response.json())
        .then(data => {
            if (data.stage) {
                currentKioskStage = data.stage;
                if (data.page) {
                    currentStagePage = data.page;
                }
                return data;
            }
            return null;
        })
        .catch(error => {
            console.error('Error fetching current stage:', error);
            return null;
        });
}

function checkCompletedStages() {
    if (suppressStageResetDuringCompletion || isCurrentlyShowingLoading || isLoadingTransitionPending) return;
    if (completedPollInFlight) return;
    completedPollInFlight = true;
    fetchWithTimeout(`http://localhost:${currentPort}/api/completed-stages`)
        .then(response => response.json())
        .then(data => {
            if (suppressStageResetDuringCompletion || isCurrentlyShowingLoading || isLoadingTransitionPending) {
                return;
            }
            if (data.cycle_completed) {
                suppressStageResetDuringCompletion = true;
                return;
            }
            const completedStages = data.completed_stages || [];
            const redButton = document.querySelector('.red-button');
            
            if (redButton && currentKioskStage) {
                const isProcessing = redButton.getAttribute('data-processing') === 'true';
                if (isProcessing) {
                    // Keep current click state; avoid wiping ripple mid-animation.
                    return;
                }
                if (completedStages.includes(currentKioskStage)) {
                    redButton.disabled = true;
                    redButton.classList.add('button-disabled');
                    if (redButton.textContent !== 'Correctly selected!') {
                        redButton.setAttribute('data-original-text', redButton.textContent);
                        redButton.textContent = 'Correctly selected!';
                    }
                } else {
                    redButton.disabled = false;
                    redButton.classList.remove('button-disabled');
                    const originalText = redButton.getAttribute('data-original-text');
                    if (originalText) {
                        redButton.textContent = originalText;
                        redButton.removeAttribute('data-original-text');
                    }
                }
            }
        })
        .catch(error => {
            console.error('Error checking completed stages:', error);
        })
        .finally(() => {
            completedPollInFlight = false;
        });
}

const redButton = document.querySelector('.red-button');
const percentageDisplay = document.getElementById('percentage-display');
const isOnLoadingPage = percentageDisplay && percentageDisplay.textContent === 'Loading';
const isStagePage = redButton && !isOnLoadingPage;

if (isStagePage) {
    const main = document.querySelector('main');
    if (main) {
        originalPageContent = main.innerHTML;
    }
    getCurrentKioskStage().then(stageInfo => {
        if (stageInfo && stageInfo.page) {
            const path = normalizeStagePagePath(stageInfo.page);
            if (path && !stageContentCache[path]) {
                stageContentCache[path] = originalPageContent;
            }
        }
        if (stageInfo && stageInfo.stage) {
            renderedStage = stageInfo.stage;
        }
        checkCompletedStages();
    });
    checkLoadingState();
    setInterval(checkLoadingState, POLL_INTERVAL);
    checkReloadState();
    setInterval(checkReloadState, POLL_INTERVAL);
    setInterval(() => {
        checkCompletedStages();
    }, POLL_INTERVAL);
} else if (isOnLoadingPage) {
    isCurrentlyShowingLoading = true;
    fetchWithTimeout(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            const message = data.click_result === 'correct'
                ? 'Cycle correctly completed!'
                : data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
            const displayElement = document.getElementById('percentage-display');
            if (displayElement) {
                displayElement.textContent = message;
            }
            if (data.click_result === 'incorrect') {
                const label = document.getElementById('label');
                if (label) {
                    label.textContent = "Restart cycle from stage 1!";
                }
            } else if (data.cycle_completed) {
                const label = document.getElementById('label');
                if (label) {
                    label.textContent = "Randomizing new cycle from stage 1";
                }
            }
            if (data.loading_end_time) {
                scheduleLoadingRestore(data.loading_end_time * 1000);
            }
        })
        .catch(error => {
            console.error('Error fetching loading state:', error);
        });
    getCurrentKioskStage()
        .then(stageInfo => {
            if (stageInfo) {
                if (stageInfo.stage) {
                    renderedStage = stageInfo.stage;
                }
                return fetchStageMainContent(stageInfo);
            }
            return null;
        })
        .then(mainHtml => {
            if (mainHtml) {
                originalPageContent = mainHtml;
            }
        })
        .catch(error => {
            console.error('Error fetching stage page:', error);
        });
    checkLoadingState();
    setInterval(checkLoadingState, POLL_INTERVAL);
    checkReloadState();
    setInterval(checkReloadState, POLL_INTERVAL);
}
