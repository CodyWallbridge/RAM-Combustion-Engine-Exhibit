global percent
percent = 0
PERCENT_STEP = 10
MAX_PERCENT = 100
MIN_PERCENT = 0
KIOSK_IDS = [1,2,3,4]
stages = [1,2,3,4]
stage_order = [] # To be randomized
stage_by_kiosk = {} # To be filled based on stage_order
completed = {1: False,2:False,3:False,4:False}
current_cycle_index = 0

def setup():
    # Initialize display and kiosks
    # Send initial percentage to display
    # Randomize stage order
    # Send first stage number to kiosks
    pass

def loop():
    # Listen for pressed events
    # Check if correct stage was pressed
    # If correct, check if cycle is completed
    # If cycle completed, increase percent by 10 as x and reset
    # If not completed, log or light up correct stage
    # If incorrect, reset cycle
    # After X seconds, reduce percent by 10 as x
    pass

def send_percentage_to_display(x):
    # Send percent value to display
    pass

def reset_cycle():
    # Reset cycle progress
    pass

def randomize_order():
    # Shuffle stage order
    pass

def send_stage_number():
    # Send stage number to kiosks
    pass

def handle_pressed_event():
    # Handle received pressed event
    pass

if __name__ == "__main__":
    setup()
    while True:
        loop()