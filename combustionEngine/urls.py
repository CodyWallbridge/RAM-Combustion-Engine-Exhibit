from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("mapping", views.mapping_view, name="mapping"),
    path("port/<int:port_id>", views.port_view, name="port"),
    path("randomize", views.randomize_view, name="randomize"),
    path("api/percentage", views.get_percentage_view, name="percentage"),
    path("api/percentage/set", views.set_percentage_view, name="set_percentage")
]