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
        // Update display
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

// Initialize polling when DOM is ready
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

// Since script is at bottom of body, DOM is ready
initPercentagePolling();