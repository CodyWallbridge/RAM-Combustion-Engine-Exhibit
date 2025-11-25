function createRipple(event) {
    const button = event.currentTarget;
    const btnRect = button.getBoundingClientRect();
    const circle = document.createElement("span");
    const diameter = Math.max(btnRect.width, btnRect.height);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - (btnRect.left + radius)}px`;
    circle.style.top = `${event.clientY - (btnRect.top + radius)}px`;
    circle.classList.add("ripple");
    const ripple = button.getElementsByClassName("ripple")[0];
    if (ripple) {
        ripple.remove();
    }
    button.appendChild(circle);
    circle.addEventListener('animationend', () => {
        circle.remove();
    });
    }
    const button = document.querySelector('.red-button');
    if (button) {
    button.addEventListener('click', createRipple);
    button.addEventListener('click', function() {
        const currentPort = window.location.port || '8001';
        fetch(`http://localhost:${currentPort}/api/button/press`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }).catch(error => {
            console.error('Error triggering loading:', error);
        });
    });
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
function switchToLoadingPage() {
    if (isCurrentlyShowingLoading || isFadingOut) return; 
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
            
            // Insert the content
            main.innerHTML = originalPageContent;
            isCurrentlyShowingLoading = false;
            setTimeout(() => {
                main.classList.remove('restoring-content');
                const redButton = main.querySelector('.red-button');
                if (redButton) {
                    redButton.addEventListener('click', createRipple);
                    redButton.addEventListener('click', function() {
                        const currentPort = window.location.port || '8001';
                        fetch(`http://localhost:${currentPort}/api/button/press`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }).catch(error => {
                            console.error('Error triggering loading:', error);
                        });
                    });
                }
            }, 50);
        }, 400);
    }
}
function checkLoadingState() {
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            if (isCurrentlyShowingLoading && data.click_result) {
                const displayElement = document.getElementById('percentage-display');
                if (displayElement) {
                    const message = data.click_result === 'correct' ? 'Correct!' : 
                                   data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
                    if (displayElement.textContent !== message) {
                        displayElement.textContent = message;
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
const redButton = document.querySelector('.red-button');
const percentageDisplay = document.getElementById('percentage-display');
const isOnLoadingPage = percentageDisplay && percentageDisplay.textContent === 'Loading';
const isStagePage = redButton && !isOnLoadingPage;

if (isStagePage) {
    const main = document.querySelector('main');
    if (main) {
        originalPageContent = main.innerHTML;
    }
    checkLoadingState();
    setInterval(checkLoadingState, 100);
} else if (isOnLoadingPage) {
    const currentPort = window.location.port || '8001';
    fetch(`http://localhost:${currentPort}/api/loading/state`)
        .then(response => response.json())
        .then(data => {
            const message = data.click_result === 'correct' ? 'Correct!' : 
                           data.click_result === 'incorrect' ? 'Incorrect.' : 'Loading';
            const displayElement = document.getElementById('percentage-display');
            if (displayElement) {
                displayElement.textContent = message;
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
    setInterval(checkLoadingState, 100);
}