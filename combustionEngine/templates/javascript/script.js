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
    fetch('http://localhost:8000/api/percentage')
      .then(response => response.json())
      .then(data => {
        const percentage = data.percentage || 0;
        // Update display
        document.getElementById('percentage-display').textContent = Math.round(percentage) + '%';
        document.getElementById('progress-bar').style.width = percentage + '%';
      })
      .catch(() => {
      });
  }
  updatePercentage();
  setInterval(updatePercentage, 100);