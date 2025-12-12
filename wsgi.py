#!/usr/bin/env python
import sys
import os

# Add the project directory to the Python path
sys.path.insert(0, '/home/easyverse.app/public_html/easyfig')

# Add the virtual environment's site-packages to the path
site_packages = '/home/easyverse.app/public_html/easyfig/venv/lib/python3.11/site-packages'
if site_packages not in sys.path:
    sys.path.insert(0, site_packages)

# Import the Flask application instance from your app's run.py
from run import app as application