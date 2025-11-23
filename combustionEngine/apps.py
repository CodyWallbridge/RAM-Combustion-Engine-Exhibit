from django.apps import AppConfig
import sys


class CombustionengineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'combustionEngine'
    
    def ready(self):
        """Start kiosk servers when Django app is ready"""
        if 'runserver' in sys.argv or 'runserver_plus' in sys.argv:
            from . import views
            views.setup_game()
            views.print_mapping()
            # Start kiosk servers
            views.start_kiosk_servers()
            print("Kiosk servers started on ports 8001-8004")
            # Start percentage display server on fixed port 9000
            views.start_percentage_server(9000)
            print("Percentage display server started on port 9000")