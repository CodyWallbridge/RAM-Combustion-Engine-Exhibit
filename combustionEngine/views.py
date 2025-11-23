from django.shortcuts import render, HttpResponse
import random
import time
import threading
import os
import json
from django.http import JsonResponse
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

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


def send_percentage_to_display():
    #returns current percentage for demo
    return JsonResponse({'percentage': percent})

# Django view to get current percentage (for API polling)
def get_percentage_view(request):
    """API endpoint to get current percentage"""
    global percent
    response = JsonResponse({'percentage': percent})
    # Add CORS headers to allow cross-origin requests
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response

def set_percentage_view(request):
    """API endpoint to set percentage (for testing)"""
    global percent
    if request.method == 'POST':
        try:
            import json
            data = json.loads(request.body)
            new_percent = float(data.get('percentage', percent))
            percent = max(0, min(100, new_percent))  # Clamp between 0-100
            response = JsonResponse({'percentage': percent, 'status': 'updated'})
        except Exception as e:
            response = JsonResponse({'error': str(e)}, status=400)
    else:
        response = JsonResponse({'percentage': percent})
    
    # Add CORS headers
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response

# Reset game cycle state
def reset_cycle():
    global stages_order, current_stage_index
    randomize_order()
    current_stage_index = 0
    send_stage_number_to_kiosks()

# Randomize the order in which stages must be completed
def randomize_order():
    global stages_order, stage_by_kiosk
    stages_order = stages.copy()
    random.shuffle(stages_order)   # uses system randomness always
    # Assign randomized stages to kiosks
    for i, kiosk in enumerate(KIOSK_IDS):
        stage_by_kiosk[kiosk] = stages_order[i]
    return stages_order

# Send current stage info to kiosks (raspberry pie for your real communication method)
def send_stage_number_to_kiosks():
    # print or log current stage
    print(f"Current stage to attempt: {stages_order[current_stage_index]}")

# Notify controller of button press (raspberry)
def send_pressed_event_to_controller(stage_number):
    print(f"Pressed event sent for stage: {stage_number}")

# Receive pressed event from user (stub)
def receive_pressed_event():
    # simulate user input matching current stage or random
    pressed = random.choice(stages)
    print(f"Received pressed: {pressed}")
    return pressed

# Decrease percentage by amount and update display
def deduce_percentage(amount):
    global percent
    percent = max(percent - amount, 0)
    print(f"Percentage decreased to: {percent}%")  # Debug log
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

# Log pressed input when partial progress made
def log_pressed(pressed):
    print(f"Correct button pressed: {pressed}")

# Main loop to be called by view task
def main_loop():
    global current_stage_index, last_percent_deduction_time, last_game_reset_time
    setup_game()
    while True:
        # Simulate times in a loop; replace with real timers in practice
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

# Get page path for a stage (extracts number from 'stage1' -> 1, then returns path)
def get_page_for_stage(stage_name: str) -> str:
    """Return the templates page path for the given stage"""
    # Extract number from 'stage1', 'stage2', etc.
    stage_num = stage_name.replace('stage', '') if isinstance(stage_name, str) else str(stage_name)
    return f"templates/pages/stage{stage_num}.html"

def print_mapping():
    """Print kiosk -> stage -> page mapping"""
    print("Kiosk -> Stage -> Page")
    for kiosk in sorted(stage_by_kiosk.keys()):
        stage = stage_by_kiosk[kiosk]
        page = get_page_for_stage(stage)
        print(f"Kiosk {kiosk} -> Stage {stage} -> {page}")

kiosk_server_threads = []
percentage_server_thread = None

def start_percentage_server(port: int = 9000):
    """Start HTTP server for percentage display on fixed port"""
    global percentage_server_thread
    
    def make_percentage_handler():
        class PercentageHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    templates_dir = os.path.normpath(os.path.join(base_dir, "templates"))
                    
                    if self.path == "/" or self.path == "":
                        # Serve percentage.html
                        page_path = os.path.join(templates_dir, "pages/percentage.html")
                        if not os.path.exists(page_path):
                            self.send_response(404)
                            self.end_headers()
                            self.wfile.write(b"Percentage page not found")
                            return
                        with open(page_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    
                    # Serve other files (CSS, JS, images, etc.)
                    file_path = os.path.normpath(os.path.join(templates_dir, self.path.lstrip("/")))
                    if os.path.exists(file_path) and os.path.commonpath([templates_dir, file_path]) == templates_dir:
                        ext = os.path.splitext(file_path)[1].lower()
                        mime = {
                            ".css": "text/css",
                            ".js": "application/javascript",
                            ".png": "image/png",
                            ".jpg": "image/jpeg",
                            ".jpeg": "image/jpeg",
                            ".svg": "image/svg+xml",
                            ".html": "text/html"
                        }.get(ext, "application/octet-stream")
                        with open(file_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", mime)
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    
                    # 404 for anything else
                    self.send_response(404)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(b"Not found")
                    
                except Exception as e:
                    self.send_response(500)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(str(e).encode())
        
        return PercentageHandler
    
    handler = make_percentage_handler()
    server = HTTPServer(("", port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    percentage_server_thread = (server, t, port)
    print(f"Started percentage display server on http://localhost:{port}")
    return percentage_server_thread

def start_kiosk_servers(base_port: int = 8001):
    """Start one simple HTTP server per kiosk on consecutive ports"""
    global kiosk_server_threads
    
    def make_handler(kiosk_id):
        class KioskHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    templates_dir = os.path.normpath(os.path.join(base_dir, "templates"))
                    
                    if self.path == "/" or self.path == "":
                        stage = stage_by_kiosk.get(kiosk_id)
                        if stage is None:
                            self.send_response(404)
                            self.send_header("Content-Type", "text/plain")
                            self.end_headers()
                            self.wfile.write(b"No stage assigned")
                            return
                        # Extract stage number from 'stage1' -> '1'
                        stage_num = stage.replace('stage', '') if isinstance(stage, str) else str(stage)
                        page_path = os.path.join(templates_dir, f"pages/stage{stage_num}.html")
                        if not os.path.exists(page_path):
                            self.send_response(404)
                            self.end_headers()
                            self.wfile.write(b"Stage page not found")
                            return
                        with open(page_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    
                    # Serve other files
                    file_path = os.path.normpath(os.path.join(templates_dir, self.path.lstrip("/")))
                    if os.path.exists(file_path) and os.path.commonpath([templates_dir, file_path]) == templates_dir:
                        ext = os.path.splitext(file_path)[1].lower()
                        mime = {
                            ".css": "text/css",
                            ".js": "application/javascript",
                            ".png": "image/png",
                            ".jpg": "image/jpeg",
                            ".jpeg": "image/jpeg",
                            ".svg": "image/svg+xml",
                            ".html": "text/html"
                        }.get(ext, "application/octet-stream")
                        with open(file_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", mime)
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    
                    # 404 for anything else
                    self.send_response(404)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(b"Not found")
                    
                except Exception as e:
                    self.send_response(500)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(str(e).encode())
        
        return KioskHandler
    
    threads = []
    for i, kiosk in enumerate(KIOSK_IDS):
        port = base_port + i
        handler = make_handler(kiosk)
        server = HTTPServer(("", port), handler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        threads.append((server, t, port, kiosk))
        print(f"Started kiosk server for Kiosk {kiosk} on http://localhost:{port}")
    
    kiosk_server_threads.extend(threads)
    return threads

# Django views for mapping endpoints
def mapping_view(request):
    """Django view for /mapping endpoint that returns kiosk to stage mapping"""
    return JsonResponse(stage_by_kiosk)

def port_view(request, port_id):
    """Django view for /port/<id> endpoint that returns port, stage, and page info"""
    try:
        port_id = int(port_id)
        if port_id in stage_by_kiosk:
            stage = stage_by_kiosk[port_id]
            page = get_page_for_stage(stage)
            return JsonResponse({
                "port": port_id,
                "stage": stage,
                "page": page
            })
        else:
            return JsonResponse({"error": "port not found"}, status=404)
    except ValueError:
        return JsonResponse({"error": "invalid port id"}, status=400)

def randomize_view(request):
    """Django view for /randomize endpoint that randomizes stage order and updates kiosk mapping"""
    try:
        randomize_order()
        return JsonResponse({
            "status": "ok",
            "stage_order": stages_order,
            "mapping": stage_by_kiosk
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
