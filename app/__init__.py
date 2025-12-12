from flask import Flask


def create_app():
    """
    Flask application factory.
    Initializes the Flask app, loads configuration, and registers blueprints.
    """
    app = Flask(__name__)

    # Load configuration from config.py
    app.config.from_object('config')

    # Import and register the main blueprint with URL prefix for deployment
    from app.routes import main_blueprint
    app.register_blueprint(main_blueprint)#, url_prefix='/easyfig')

    return app