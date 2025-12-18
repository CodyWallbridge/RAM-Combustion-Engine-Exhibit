import random
import time
import threading
import os
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


global percent
percent = 0
LOADING_DURATION = 3.0
KIOSK_IDS = [1, 2, 3, 4]
stages = ['stage1', 'stage2', 'stage3', 'stage4']
stages_order = []  # To be randomized
current_stage_index = 0  # Index in stages list (0=stage1, 1=stage2, 2=stage3, 3=stage4)


stage_by_kiosk = {}  # To be filled based on stage_order


# Track completed stages in current cycle
completed_stages_in_cycle = []


# Global state for loading screen
show_loading = False
loading_timeout = None
last_click_result = None  # 'correct' or 'incorrect'
cycle_completed_flag = False
loading_end_time = None


# Global state for reload
reload_triggered = False
reload_timeout = None


def get_percentage_view():
    global percent
    return {'percentage': percent}


def trigger_loading():
    """Trigger loading screen on all kiosks"""
    global show_loading, loading_timeout, loading_end_time
    show_loading = True
    loading_end_time = time.time() + LOADING_DURATION
    if loading_timeout:
        loading_timeout.cancel()
    loading_timeout = threading.Timer(LOADING_DURATION, reset_loading)
    loading_timeout.start()
    return {'status': 'loading_triggered', 'loading_end_time': loading_end_time}


def reset_loading():
    """Reset loading screen state"""
    global show_loading, last_click_result, reload_triggered, cycle_completed_flag, loading_end_time
    show_loading = False
    last_click_result = None  # Clear result when loading resets
    cycle_completed_flag = False
    loading_end_time = None


def get_loading_state():
    """Get current loading state"""
    global show_loading, last_click_result, cycle_completed_flag, loading_end_time
    return {
        'show_loading': show_loading,
        'click_result': last_click_result,
        'cycle_completed': cycle_completed_flag,
        'loading_end_time': loading_end_time
    }


def trigger_reload():
    """Trigger reload on all kiosks"""
    global reload_triggered, reload_timeout
    reload_triggered = True
    if reload_timeout:
        reload_timeout.cancel()
    reload_timeout = threading.Timer(5.0, reset_reload)
    reload_timeout.start()
    return {'status': 'reload_triggered'}


def get_reload_state():
    """Get current reload state"""
    global reload_triggered
    return {'reload': reload_triggered}


def reset_reload():
    """Reset reload state"""
    global reload_triggered, reload_timeout
    reload_triggered = False
    reload_timeout = None


def reset_cycle():
    global stages_order, current_stage_index
    randomize_order()
    current_stage_index = 0  # Always start with stage1
    send_stage_number_to_kiosks()


def restart_cycle():
    global current_stage_index, percent
    current_stage_index = 0  # Always start with stage1
    percent = max(percent - 10, 0)
    send_stage_number_to_kiosks()


def randomize_order():
    global stages_order, stage_by_kiosk
    stages_order = stages.copy()
    random.shuffle(stages_order)
    available_kiosks = KIOSK_IDS.copy()
    random.shuffle(available_kiosks)
    
    for i, stage in enumerate(stages_order):
        stage_by_kiosk[available_kiosks[i]] = stage
    
    print_mapping()
    return stages_order


def send_stage_number_to_kiosks():
    global current_stage_index, stage_by_kiosk
    current_target_stage = stages[current_stage_index]
    
    # Find which kiosk has this stage
    kiosk_with_stage = None
    for kiosk_id, stage in stage_by_kiosk.items():
        if stage == current_target_stage:
            kiosk_with_stage = kiosk_id
            break
    
    if kiosk_with_stage:
        # Calculate port: base_port (8001) + (kiosk_id - 1) since kiosk 1 is at index 0
        port = 8001 + (kiosk_with_stage - 1)
        print(f"Port {port} ({current_target_stage})")
    else:
        print(f"Current stage to attempt: {current_target_stage} (not found on any kiosk)")


def check_correct_stage(pressed_stage):
    """Check if the pressed stage matches the current target stage"""
    global current_stage_index
    current_target_stage = stages[current_stage_index]
    return pressed_stage == current_target_stage


def increase_percentage(amount):
    global percent
    percent = min(percent + amount, 100)
    print(f"Percentage increased to: {percent}%")  # Debug log


def log_pressed(pressed):
    print(f"Correct button pressed: {pressed}")


def get_page_for_stage(stage_name: str) -> str:
    # **# <<< CHANGED: now returns the *game* page instead of the old stage page**
    stage_num = stage_name.replace('stage', '') if isinstance(stage_name, str) else str(stage_name)
    return f"pages/game-stage{stage_num}.html"  # **CHANGED**


def get_screensaver_page_for_stage(stage_name: str) -> str:
    # **# <<< ADDED: helper to get the old stageX.html as screensaver**
    stage_num = stage_name.replace('stage', '') if isinstance(stage_name, str) else str(stage_name)
    return f"pages/stage{stage_num}.html"  # **ADDED**


def print_mapping():
    print("Kiosk -> Stage -> Page")
    for kiosk in sorted(stage_by_kiosk.keys()):
        stage = stage_by_kiosk[kiosk]
        page = get_page_for_stage(stage)
        print(f"Kiosk {kiosk} -> Stage {stage} -> {page}")


def start_percentage_server(port: int = 9000):
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
    print(f"Started percentage display server on http://localhost:{port}")


def start_demo_server(port: int = 9001):
    def make_demo_handler():
        class DemoHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    base_dir = os.path.dirname(os.path.abspath(__file__))
                    frontend_dir = os.path.normpath(os.path.join(base_dir, "..", "frontend"))

                    if self.path == "/" or self.path == "":
                        page_path = os.path.join(frontend_dir, "pages", "demo.html")
                        if not os.path.exists(page_path):
                            self.send_response(404)
                            self.send_header("Content-Type", "text/plain")
                            self.end_headers()
                            self.wfile.write(b"Demo page not found")
                            return
                        with open(page_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    # Serve static assets for the demo page
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

        return DemoHandler

    handler = make_demo_handler()
    server = HTTPServer(("", port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"Started demo dashboard on http://localhost:{port}")


def start_kiosk_servers(base_port: int = 8001):
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

                    if self.path.startswith("/api/loading/trigger"):
                        response_data = trigger_loading()
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    if self.path.startswith("/api/loading/state"):
                        response_data = get_loading_state()
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    if self.path.startswith("/api/reload"):
                        response_data = get_reload_state()
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    if self.path.startswith("/api/completed-stages"):
                        global completed_stages_in_cycle, cycle_completed_flag
                        response_data = {
                            'completed_stages': completed_stages_in_cycle.copy(),
                            'cycle_completed': cycle_completed_flag
                        }
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return

                    # **# <<< ADDED: route to serve screensaver (old stageX.html)**
                    if self.path.startswith("/screensaver"):
                        stage = stage_by_kiosk.get(kiosk_id)
                        if stage is None:
                            self.send_response(404)
                            self.send_header("Content-Type", "text/plain")
                            self.end_headers()
                            self.wfile.write(b"No stage assigned")
                            return

                        page_path = os.path.join(frontend_dir, get_screensaver_page_for_stage(stage))
                        if not os.path.exists(page_path):
                            self.send_response(404)
                            self.send_header("Content-Type", "text/plain")
                            self.end_headers()
                            self.wfile.write(b"Screensaver page not found")
                            return

                        with open(page_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    # **END ADDED**

                    if self.path == "/" or self.path == "":
                        # Check if we should show loading screen
                        if show_loading:
                            page_path = os.path.join(frontend_dir, "pages", "loading.html")
                            if os.path.exists(page_path):
                                with open(page_path, "rb") as f:
                                    content = f.read()
                                self.send_response(200)
                                self.send_header("Content-Type", "text/html")
                                self.send_header("Content-Length", str(len(content)))
                                self.end_headers()
                                self.wfile.write(content)
                                return
                        stage = stage_by_kiosk.get(kiosk_id)
                        if stage is None:
                            self.send_response(404)
                            self.send_header("Content-Type", "text/plain")
                            self.end_headers()
                            self.wfile.write(b"No stage assigned")
                            return

                        # **# <<< CHANGED: serve game-stageX.html as the main page**
                        stage_page_rel = get_page_for_stage(stage)  # pages/game-stageX.html
                        page_path = os.path.join(frontend_dir, stage_page_rel)
                        # **END CHANGED**

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

            def do_POST(self):
                """Handle POST requests (button presses)"""
                try:
                    if self.path.startswith("/api/button/press"):
                        # Get which stage this kiosk has
                        pressed_stage = stage_by_kiosk.get(kiosk_id)
                        
                        if pressed_stage:
                            # Check if this is the correct stage to press
                            global last_click_result, current_stage_index, completed_stages_in_cycle, cycle_completed_flag
                            if check_correct_stage(pressed_stage):
                                previous_stage_index = current_stage_index
                                current_stage_index = (current_stage_index + 1) % len(stages)
                                
                                # Add to completed stages if not already there
                                if pressed_stage not in completed_stages_in_cycle:
                                    completed_stages_in_cycle.append(pressed_stage)
                                
                                # Check if cycle completed (wrapped from last stage to first)
                                cycle_completed = previous_stage_index == len(stages) - 1 and current_stage_index == 0
                                
                                if cycle_completed:
                                    increase_percentage(15)
                                    randomize_order()
                                    completed_stages_in_cycle = []
                                    cycle_completed_flag = True
                                    trigger_loading()  # Show completion/loading screen for final stage
                                    last_click_result = 'correct'  # Only show correct message at cycle boundary
                                    # Delay reload until after the loading screen duration to avoid flicker
                                    global reload_timeout
                                    reload_timeout = threading.Timer(LOADING_DURATION, trigger_reload)
                                    reload_timeout.start()
                                else:
                                    cycle_completed_flag = False
                                    last_click_result = None  # Skip mid-cycle correct screen
                                
                                log_pressed(pressed_stage)
                                send_stage_number_to_kiosks()  # Print new target stage
                                
                                # Set result for loading screen
                                response_data = {
                                    'status': 'correct',
                                    'stage': pressed_stage,
                                    'next_stage': stages[current_stage_index],
                                    'percentage': percent,
                                    'cycle_completed': cycle_completed,
                                    'completed_stages': completed_stages_in_cycle.copy()
                                }
                            else:
                                restart_cycle()
                                completed_stages_in_cycle = []
                                cycle_completed_flag = False
                                
                                # Set result for loading screen
                                last_click_result = 'incorrect'
                                
                                response_data = {
                                    'status': 'incorrect',
                                    'pressed': pressed_stage,
                                    'expected': stages[current_stage_index],
                                    'reset_to': 'stage1',
                                    'completed_stages': []
                                }
                        else:
                            response_data = {'error': 'No stage assigned to this kiosk'}
                        
                        # Trigger loading only when incorrect
                        if response_data.get('status') == 'incorrect':
                            trigger_loading()
                        
                        content = json.dumps(response_data).encode()
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    else:
                        self.send_response(404)
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

    return threads


def percentage_decrement_worker():
    global percent
    while True:
        try:
            time.sleep(5.0)
            if isinstance(percent, (int, float)) and percent > 0:
                percent = max(0, percent - 1)
                print(f"Percentage decreased to: {percent}%")
        except Exception:
            pass


def start_percentage_decrement_thread():
    t = threading.Thread(target=percentage_decrement_worker, daemon=True)
    t.start()
    print("Started percentage decrement thread (decreases by 1 every 3s)")


def setup():
    # Randomize stage order
    randomize_order()
    # Send first stage number to kiosks
    send_stage_number_to_kiosks()
    # Start servers
    start_percentage_server(9000)
    start_demo_server(9001)
    start_kiosk_servers(8001)
    # Start background thread that decrements percentage every 3 seconds
    start_percentage_decrement_thread()
    print("\nAll servers started!")
    print_mapping()


def loop():
    pass


if __name__ == "__main__":
    setup()
    print("\nMain loop starting... Press Ctrl+C to stop.")
    try:
        while True:
            loop()
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nShutting down servers...")
