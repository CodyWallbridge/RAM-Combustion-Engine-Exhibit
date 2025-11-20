from django.shortcuts import render, HttpResponse
import random
import time
from django.http import JsonResponse

# Globals (for example; in real Django apps, use session or database models)
global percent
percent = 0
PERCENT_STEP = 10
MAX_PERCENT = 100
MIN_PERCENT = 0
KIOSK_IDS = [1,2,3,4]
stages = ['stage1', 'stage2', 'stage3', 'stage4']
stages_order = [] #To be randomized
current_stage_index = 0
last_percent_deduction_time = time.time()
last_game_reset_time = time.time()



stage_by_kiosk = {} # To be filled based on stage_order
completed = {1:False,2:False,3:False,4:False}
current_cycle_index = 0

# Create your views here.
def home(request):
    return HttpResponse('Home Page')


# Called to send percentage update (could update database, cache, or respond)
def send_percentage_to_display():
    # Example: simply returns current percentage for demo
    return JsonResponse({'percentage': percent})

# Reset game cycle state
def reset_cycle():
    global current_order, current_stage_index
    randomize_order()
    current_stage_index = 0
    send_stage_number_to_kiosks()

# Randomize the order in which stages must be completed
def randomize_order():
    global current_order
    current_order = stages[:]
    random.shuffle(current_order)

# Send current stage info to kiosks (stub for your real communication method)
def send_stage_number_to_kiosks():
    # Example: just print or log; replace with real comms
    print(f"Current stage to attempt: {stages_order[current_stage_index]}")

# Notify controller of button press (stub)
def send_pressed_event_to_controller(stage_number):
    print(f"Pressed event sent for stage: {stage_number}")

# Receive pressed event from user (stub)
def receive_pressed_event():
    # Placeholder: in real scenario, capture from HTTP request or socket
    # Here just simulate user input matching current stage or random
    pressed = random.choice(stages)
    print(f"Received pressed: {pressed}")
    return pressed

# Decrease percentage by amount and update display
def deduce_percentage(amount):
    global percent
    percent = max(percent - amount, 0)
    send_percentage_to_display()

# Check if pressed stage is the correct one in current order sequence
def check_correct_stage(pressed):
    return pressed == stages_order[current_stage_index]

# Check if the whole cycle/order has been completed
def cycle_completed():
    return current_stage_index >= len(stages_order) - 1

# Increase percentage by amount and update display
def increase_percentage(amount):
    global percent
    percent = min(percent + amount, 100)
    send_percentage_to_display()

# Log or process pressed input when partial progress made
def log_pressed(pressed):
    print(f"Correct button pressed: {pressed}")

# Main game loop to be called by view or async task
def main_loop():
    global current_stage_index, last_percent_deduction_time, last_game_reset_time
    setup_game()
    while True:
        # Simulate times in a loop; replace with real async/timers in practice
        if time.time() - last_percent_deduction_time > 10:  # every 10 sec
            deduce_percentage(10)
            last_percent_deduction_time = time.time()

        if time.time() - last_game_reset_time > 60:  # every 60 sec
            reset_cycle()
            last_game_reset_time = time.time()

        pressed = receive_pressed_event()

        if check_correct_stage(pressed):
            if cycle_completed():
                increase_percentage(10)
                reset_cycle()
            else:
                log_pressed(pressed)
                current_stage_index += 1  # progress to next stage
        else:
            reset_cycle()

def setup_game():
    reset_cycle()
