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

const button = document.querySelector('.red-button');

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
        
        fetch(`http://localhost:${currentPort}/api/button/press`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            isProcessing = false;
            targetButton.removeAttribute('data-processing');
            if (data.completed_stages !== undefined) {
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
    fetch('http://localhost:9000/api/percentage')
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
    setInterval(updatePercentage, 100);
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
let currentStagePage = null;
let renderedStage = null;
let stageContentCache = {};
let pendingStageRefresh = false;

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
    
    if (options.fadeIn) {
        main.classList.add('fade-in');
        setTimeout(() => {
            main.classList.remove('fade-in');
        }, 400);
    }
    
    attachRedButtonHandlers(main.querySelector('.red-button'));
    checkCompletedStages();
}

function switchToLoadingPage() {
    if (isCurrentlyShowingLoading || isFadingOut) return; 
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
            
            fetch(`http://localhost:${currentPort}/api/loading/state`)
                .then(response => response.json())
                .then(data => {
                    const displayElement = document.getElementById('percentage-display');
                    const labelElement = document.getElementById('label');
                    if (displayElement && data.click_result) {
                        const message = data.click_result === 'correct' ? 'Correct!' : 
                                       data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
                        displayElement.textContent = message;
                        if (data.click_result === 'incorrect') {
                            const label = document.getElementById('label');
                            label.textContent = "Restart cycle from stage 1!"; 
                        } else if (data.cycle_completed && labelElement) {
                            labelElement.textContent = "Cycle successfully completed! New random cycle loading...";
                        }
                    }
                })
                .catch(error => {
                });
        }, 400);
    }
}

function restoreOriginalPage() {
    if (!isCurrentlyShowingLoading || isRestoringContent) return; 
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
            });
    }, 400);
}

function checkLoadingState() {
    fetch(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            if (isCurrentlyShowingLoading && data.click_result) {
                const displayElement = document.getElementById('percentage-display');
                const labelElement = document.getElementById('label');
                if (displayElement) {
                    const message = data.click_result === 'correct' ? 'Correct!' : 
                                   data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
                    if (displayElement.textContent !== message) {
                        displayElement.textContent = message;
                    }
                    if (data.click_result === 'incorrect') {
                        const label = document.getElementById('label');
                        if (label) {
                            label.textContent = "Restart cycle from stage 1!";
                        }
                    } else if (data.cycle_completed && labelElement) {
                        labelElement.textContent = "Cycle successfully completed! New random cycle loading...";
                    }
                }
            }
            if (data.show_loading && !isCurrentlyShowingLoading) {
                switchToLoadingPage();
            } else if (!data.show_loading && isCurrentlyShowingLoading) {
                restoreOriginalPage();
            }
        })
        .catch(error => {
            console.error('Error checking loading state:', error);
        });
}

function checkReloadState() {
    fetch(`http://localhost:${currentPort}/api/reload`)
        .then(response => response.json())
        .then(data => {
            if (data.reload) {
                pendingStageRefresh = true;
                if (!isCurrentlyShowingLoading && !isRestoringContent) {
                    getCurrentKioskStage().then(stageInfo => {
                        if (stageInfo) {
                            renderStageContent(stageInfo, { fadeIn: true });
                        }
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error checking reload state:', error);
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
    fetch(`http://localhost:${currentPort}/api/completed-stages`)
        .then(response => response.json())
        .then(data => {
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
                    if (redButton.textContent !== 'Stage already selected!') {
                        redButton.setAttribute('data-original-text', redButton.textContent);
                        redButton.textContent = 'Stage already selected!';
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
    setInterval(checkLoadingState, 100);
    checkReloadState();
    setInterval(checkReloadState, 100);
    setInterval(() => {
        checkCompletedStages();
    }, 200);
} else if (isOnLoadingPage) {
    isCurrentlyShowingLoading = true;
    fetch(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            const message = data.click_result === 'correct' ? 'Correct!' : 
                           data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
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
                    label.textContent = "Cycle successfully completed! New random cycle loading...";
                }
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
    setInterval(checkLoadingState, 100);
    checkReloadState();
    setInterval(checkReloadState, 100);
}
