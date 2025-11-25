import random
import time
import threading
import os
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

global percent
percent = 50
PERCENT_STEP = 10
MAX_PERCENT = 100
MIN_PERCENT = 0
KIOSK_IDS = [1, 2, 3, 4]
stages = ['stage1', 'stage2', 'stage3', 'stage4']
stages_order = []  # To be randomized
current_stage_index = 0
last_percent_deduction_time = time.time()
last_game_reset_time = time.time()

stage_by_kiosk = {}  # To be filled based on stage_order
completed = {1: False, 2: False, 3: False, 4: False}
current_cycle_index = 0

kiosk_server_threads = []
percentage_server_thread = None


def send_percentage_to_display():
    return {'percentage': percent}


def get_percentage_view():
    global percent
    return {'percentage': percent}


def set_percentage_view(new_percent):
    global percent
    percent = max(0, min(100, float(new_percent)))  # Clamp between 0-100
    return {'percentage': percent, 'status': 'updated'}


def reset_cycle():
    global stages_order, current_stage_index
    randomize_order()
    current_stage_index = 0
    send_stage_number_to_kiosks()


def randomize_order():
    global stages_order, stage_by_kiosk
    stages_order = stages.copy()
    random.shuffle(stages_order)
    # Assign randomized stages to kiosks
    for i, kiosk in enumerate(KIOSK_IDS):
        stage_by_kiosk[kiosk] = stages_order[i]
    return stages_order


def send_stage_number_to_kiosks():
    print(f"Current stage to attempt: {stages_order[current_stage_index]}")


def send_pressed_event_to_controller(stage_number):
    print(f"Pressed event sent for stage: {stage_number}")


def receive_pressed_event():
    # simulate user input matching current stage or random
    pressed = random.choice(stages)
    print(f"Received pressed: {pressed}")
    return pressed


def deduce_percentage(amount):
    global percent
    percent = max(percent - amount, 0)
    print(f"Percentage decreased to: {percent}%")  # Debug log
    send_percentage_to_display()


def check_correct_stage(pressed):
    return pressed == stages_order[current_stage_index]


def cycle_completed():
    return current_stage_index >= len(stages_order) - 1


def increase_percentage(amount):
    global percent
    percent = min(percent + amount, 100)
    send_percentage_to_display()


def log_pressed(pressed):
    print(f"Correct button pressed: {pressed}")


def main_loop():
    global current_stage_index, last_percent_deduction_time, last_game_reset_time
    setup_game()
    while True:
        # if time.time() - last_percent_deduction_time > 10:  # every 10 sec
        #     deduce_percentage(10)
        #     last_percent_deduction_time = time.time()

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


def get_page_for_stage(stage_name: str) -> str:
    # Extract number from 'stage1', 'stage2', etc.
    stage_num = stage_name.replace('stage', '') if isinstance(stage_name, str) else str(stage_name)
    return f"pages/stage{stage_num}.html"


def print_mapping():
    print("Kiosk -> Stage -> Page")
    for kiosk in sorted(stage_by_kiosk.keys()):
        stage = stage_by_kiosk[kiosk]
        page = get_page_for_stage(stage)
        print(f"Kiosk {kiosk} -> Stage {stage} -> {page}")


def start_percentage_server(port: int = 9000):
    global percentage_server_thread

    def make_percentage_handler():
        class PercentageHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    frontend_dir = os.path.normpath(os.path.join(base_dir, "..", "frontend"))

                    # Handle API endpoints
                    if self.path.startswith("/api/percentage"):
                        response_data = get_percentage_view()
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    # Serve percentage.html if exists
                    if self.path == "/" or self.path == "":
                        page_path = os.path.join(frontend_dir, "pages", "percentage.html")
                        if not os.path.exists(page_path):
                            # Try index.html as fallback
                            page_path = os.path.join(frontend_dir, "index.html")
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
                    file_path = os.path.normpath(os.path.join(frontend_dir, self.path.lstrip("/")))
                    if os.path.exists(file_path) and os.path.commonpath([frontend_dir, file_path]) == frontend_dir:
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

            def log_message(self, format, *args):
                pass

        return PercentageHandler

    handler = make_percentage_handler()
    server = HTTPServer(("", port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    percentage_server_thread = (server, t, port)
    print(f"Started percentage display server on http://localhost:{port}")
    return percentage_server_thread


def start_kiosk_servers(base_port: int = 8001):
    global kiosk_server_threads

    def make_handler(kiosk_id):
        class KioskHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    frontend_dir = os.path.normpath(os.path.join(base_dir, "..", "frontend"))

                    # Handle API endpoints
                    if self.path.startswith("/api/stage"):
                        stage = stage_by_kiosk.get(kiosk_id)
                        if stage:
                            response_data = {
                                "kiosk": kiosk_id,
                                "stage": stage,
                                "page": get_page_for_stage(stage)
                            }
                        else:
                            response_data = {"error": "No stage assigned"}
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

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
                        page_path = os.path.join(frontend_dir, "pages", f"stage{stage_num}.html")

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

                    # Serve other files (CSS, JS, images, etc.)
                    file_path = os.path.normpath(os.path.join(frontend_dir, self.path.lstrip("/")))
                    if os.path.exists(file_path) and os.path.commonpath([frontend_dir, file_path]) == frontend_dir:
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

            def log_message(self, format, *args):
                pass

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


def mapping_view():
    return stage_by_kiosk


def port_view(port_id):
    try:
        port_id = int(port_id)
        if port_id in stage_by_kiosk:
            stage = stage_by_kiosk[port_id]
            page = get_page_for_stage(stage)
            return {
                "port": port_id,
                "stage": stage,
                "page": page
            }
        else:
            return {"error": "port not found"}
    except ValueError:
        return {"error": "invalid port id"}


def randomize_view():
    try:
        randomize_order()
        return {
            "status": "ok",
            "stage_order": stages_order,
            "mapping": stage_by_kiosk
        }
    except Exception as e:
        return {"error": str(e)}


def setup():
    # Randomize stage order
    randomize_order()
    # Send initial percentage to display
    send_percentage_to_display()
    # Send first stage number to kiosks
    send_stage_number_to_kiosks()
    # Start servers
    start_percentage_server(9000)
    start_kiosk_servers(8001)
    print("\nAll servers started!")
    print_mapping()


def loop():
    global current_stage_index, last_percent_deduction_time, last_game_reset_time
    
    # Check if time to decrease percentage
    if time.time() - last_percent_deduction_time > 10:  # every 10 sec
        deduce_percentage(PERCENT_STEP)
        last_percent_deduction_time = time.time()

    # Check if time to reset cycle
    if time.time() - last_game_reset_time > 60:  # every 60 sec
        reset_cycle()
        last_game_reset_time = time.time()

if __name__ == "__main__":
    setup()
    print("\nMain loop starting... Press Ctrl+C to stop.")
    try:
        while True:
            loop()
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nShutting down servers...")
