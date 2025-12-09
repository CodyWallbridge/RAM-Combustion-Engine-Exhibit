function createRipple(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    const btnRect = button.getBoundingClientRect();
    const circle = document.createElement("span");
    const diameter = Math.max(btnRect.width, btnRect.height);
    const radius = diameter / 2;
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

const button = document.querySelector('.red-button');
if (button) {
    button.addEventListener('click', createRipple);
    let isProcessing = false;
    button.addEventListener('click', function() {
        if (button.disabled || isProcessing) return;
        isProcessing = true;
        button.setAttribute('data-processing', 'true');
        button.disabled = true;
        const currentPort = window.location.port || '8001';
        fetch(`http://localhost:${currentPort}/api/button/press`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, 5000)
        .then(response => response.json())
        .then(data => {
            isProcessing = false;
            button.removeAttribute('data-processing');
            if (data.completed_stages !== undefined) {
                setTimeout(() => {
                    checkCompletedStages();
                }, 100);
            }
        })
        .catch(error => {
            console.error('Error triggering loading:', error);
            isProcessing = false;
            button.removeAttribute('data-processing');
            button.disabled = false;
        });
    });
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
        if (!originalPageContent) {
            originalPageContent = main.innerHTML;
        }
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
            
            const currentPort = window.location.port || '8001';
            fetch(`http://localhost:${currentPort}/api/loading/state`)
                .then(response => response.json())
                .then(data => {
                    const displayElement = document.getElementById('percentage-display');
                    if (displayElement && data.click_result) {
                        const message = data.click_result === 'correct' ? 'Correct!' : 
                                       data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
                        displayElement.textContent = message;
                        if (data.click_result === 'incorrect') {
                            const label = document.getElementById('label');
                            label.textContent = "Restart cycle from stage 1!"; 
                        }
                    }
                })
                .catch(error => {
                });
        }, 400);
    }
}

function restoreOriginalPage() {
    if (!isCurrentlyShowingLoading) return; 
    const main = document.querySelector('main');
    if (main && originalPageContent) {
        const loadingContainer = main.querySelector('.percentage-container');
        if (loadingContainer) {
            loadingContainer.classList.add('loading-fade-out');
        } else {
            main.classList.add('fade-out');
        }
        setTimeout(() => {
            if (loadingContainer) {
                loadingContainer.classList.remove('loading-fade-out');
            } else {
                main.classList.remove('fade-out');
            }           
            main.classList.add('restoring-content');
            
            main.innerHTML = originalPageContent;
            isCurrentlyShowingLoading = false;
            
            setTimeout(() => {
                main.classList.remove('restoring-content');
                
                // Get the kiosk stage FIRST before setting up button
                getCurrentKioskStage().then(() => {
                    // THEN check completed stages to set disabled state
                    checkCompletedStages();
                    
                    // FINALLY set up the button event listeners
                    const redButton = main.querySelector('.red-button');
                    if (redButton) {
                        let isProcessing = false;
                        redButton.addEventListener('click', createRipple);
                        redButton.addEventListener('click', function() {
                            if (redButton.disabled || isProcessing) return;
                            isProcessing = true;
                            redButton.setAttribute('data-processing', 'true');
                            redButton.disabled = true;
                            const currentPort = window.location.port || '8001';
                            fetch(`http://localhost:${currentPort}/api/button/press`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })
                            .then(response => response.json())
                            .then(data => {
                                isProcessing = false;
                                redButton.removeAttribute('data-processing');
                                if (data.completed_stages !== undefined) {
                                    setTimeout(() => {
                                        checkCompletedStages();
                                    }, 100);
                                }
                            })
                            .catch(error => {
                                console.error('Error triggering loading:', error);
                                isProcessing = false;
                                redButton.removeAttribute('data-processing');
                                redButton.disabled = false;
                            });
                        });
                    }
                });
                
                checkReloadState();
            }, 50);
        }, 400);
    }
}

function checkLoadingState() {
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/loading/state`)
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
                    }
                }
            }
            if (data.show_loading && !isCurrentlyShowingLoading) {
                switchToLoadingPage(data);
            } else if (data.show_loading && isCurrentlyShowingLoading && data.loading_end_time) {
                scheduleLoadingRestore(data.loading_end_time * 1000);
            } else if (!data.show_loading && isCurrentlyShowingLoading) {
                restoreOriginalPage();
                setTimeout(() => {
                    checkReloadState();
                }, 600);
            }
            
            if (!data.show_loading && !isCurrentlyShowingLoading) {
                checkReloadState();
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
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/reload`)
        .then(response => response.json())
        .then(data => {
            if (data.reload) {
                setTimeout(() => {
                    window.location.reload();
                }, 100);
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
    const currentPort = window.location.port || '8001';
    return fetch(`http://localhost:${currentPort}/api/stage`)
        .then(response => response.json())
        .then(data => {
            if (data.stage) {
                currentKioskStage = data.stage;
                return data.stage;
            }
            return null;
        })
        .catch(error => {
            console.error('Error fetching current stage:', error);
            return null;
        });
}

function checkCompletedStages() {
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/completed-stages`)
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
                if (completedStages.includes(currentKioskStage) || isProcessing) {
                    const existingRipples = redButton.getElementsByClassName("ripple");
                    while (existingRipples.length > 0) {
                        existingRipples[0].remove();
                    }
                    redButton.disabled = true;
                    // DON'T set opacity inline - use a class instead
                    redButton.classList.add('button-disabled');
                    if (redButton.textContent !== 'Correctly selected!') {
                        redButton.setAttribute('data-original-text', redButton.textContent);
                        redButton.textContent = 'Correctly selected!';
                    }
                } else {
                    redButton.disabled = false;
                    // Remove the class instead of setting inline opacity
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
    getCurrentKioskStage().then(() => {
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
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/loading/state`)
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
            }
        })
        .catch(error => {
            console.error('Error fetching loading state:', error);
        });
    fetch(`http://localhost:${currentPort}/api/stage`)
        .then(response => response.json())
        .then(data => {
            if (data.page) {
                const pagePath = data.page.replace('pages/', '');
                return fetch(`http://localhost:${currentPort}/${pagePath}`);
            }
            throw new Error('No stage page info');
        })
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const mainContent = doc.querySelector('main');
            if (mainContent) {
                originalPageContent = mainContent.innerHTML;
                isCurrentlyShowingLoading = true; 
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