import base64
import io
import json
import os
from typing import Optional

from flask import Blueprint, current_app, jsonify, render_template, request, send_file
from PIL import Image, UnidentifiedImageError

main_blueprint = Blueprint('main', __name__)

# Load journal rules once
JOURNAL_RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'journal_rules.json')
with open(JOURNAL_RULES_PATH, 'r', encoding='utf-8') as f:
    JOURNAL_RULES = json.load(f)

@main_blueprint.route('/')
def index():
    return render_template('index.html')

@main_blueprint.route('/faq')
def faq():
    return render_template('faq.html')

@main_blueprint.route('/privacy')
def privacy():
    return render_template('privacy.html')

@main_blueprint.route('/terms')
def terms():
    return render_template('terms.html')

@main_blueprint.route('/contact')
def contact():
    contact_info = {
        'lab_name': 'Pharmaco-Omics Lab – Omics for Personalized Medicine',
        'description': (
            'The Pharmaco-Omics Lab leverages cutting-edge laboratory, clinical, and computational approaches '
            'to understand the molecular mechanisms of human metabolic diseases (in the broad sense), discover '
            'clinically relevant biomarkers, and develop personalized treatment strategies.'
        ),
        'main_contributor': 'Nguyen Thien Luan',
        'main_contributor_email': 'ntluan1991@gmail.com',
        'contributors': 'Nguyen Quang Thu, <to be updated>',
        'principal_investigator': 'Nguyen Phuoc Long, M.D., Ph.D.',
        'pi_email': 'pharmacoomicslab<at>gmail<dot>com'
    }
    return render_template('contact.html', contact=contact_info)

@main_blueprint.route('/api/journal-rules')
def get_journal_rules():
    return jsonify(JOURNAL_RULES)

@main_blueprint.route('/api/export-<format>', methods=['POST'])
def export_figure(format):
    fmt = format.lower().replace('jpg', 'jpeg')
    allowed = {'png', 'jpeg', 'tiff', 'pdf'}
    if fmt not in allowed:
        return jsonify({'error': 'Export failed', 'details': f'unsupported format: {fmt}'}), 400

    content_type = (request.content_type or '').lower()

    # Multipart upload pathway
    if content_type.startswith('multipart/form-data'):
        try:
            upload = request.files.get('image')
            mime_map = { 'png': 'image/png', 'jpeg': 'image/jpeg', 'tiff': 'image/tiff', 'pdf': 'application/pdf' }
            if not upload:
                return jsonify({'error': 'Export failed', 'details': 'missing_file'}), 400
            try:
                img = Image.open(upload.stream)
                img.load()
            except UnidentifiedImageError:
                return jsonify({'error': 'Export failed', 'details': 'unidentified_image'}), 400
            except Exception as e:
                return jsonify({'error': 'Export failed', 'details': f'image_open:{e}'}), 400

            try:
                dpi = int(request.form.get('dpi', '600'))
            except ValueError:
                dpi = 600
            dpi = max(50, min(2400, dpi))
            quality = 90
            if fmt == 'jpeg':
                try:
                    quality = int(request.form.get('quality', '90'))
                except ValueError:
                    quality = 90
                quality = max(40, min(95, quality))

            if img.mode == 'RGBA' and fmt in {'jpeg', 'tiff', 'pdf'}:
                img = img.convert('RGB')

            output_buffer = io.BytesIO()
            try:
                if fmt == 'tiff':
                    img.save(output_buffer, format='TIFF', dpi=(dpi, dpi), compression='tiff_lzw')
                elif fmt == 'pdf':
                    img.save(output_buffer, format='PDF', resolution=dpi)
                elif fmt == 'jpeg':
                    img.save(output_buffer, format='JPEG', dpi=(dpi, dpi), quality=quality)
                else:
                    img.save(output_buffer, format='PNG', dpi=(dpi, dpi))
            except Exception as e:
                current_app.logger.exception('Pillow save failed (multipart)')
                return jsonify({'error': 'Export failed', 'details': f'save_failed:{e}'}), 500

            output_buffer.seek(0)
            if request.args.get('mode') == 'json':
                b64 = base64.b64encode(output_buffer.getvalue()).decode('ascii')
                return jsonify({'ok': True, 'format': fmt, 'base64': b64})

            resp = send_file(output_buffer, mimetype=mime_map[fmt], as_attachment=True, download_name=f'figure.{fmt}')
            resp.headers['Cache-Control'] = 'no-transform'
            return resp
        except Exception:
            current_app.logger.exception('Unhandled multipart export error')
            return jsonify({'error': 'Export failed', 'details': 'multipart_unhandled'}), 500

    # Legacy JSON base64 pathway
    try:
        data = request.get_json(force=True, silent=False) or {}
    except Exception as e:
        return jsonify({'error': 'Export failed', 'details': f'bad_json:{e}'}), 400

    canvas_data_url = data.get('canvasDataUrl')
    if not canvas_data_url or ',' not in canvas_data_url:
        return jsonify({'error': 'Export failed', 'details': 'missing_or_invalid_canvasDataUrl'}), 400

    try:
        header, encoded = canvas_data_url.split(',', 1)
        image_data = base64.b64decode(encoded)
    except Exception as e:
        return jsonify({'error': 'Export failed', 'details': f'base64_decode:{e}'}), 400

    image_stream = io.BytesIO(image_data)
    try:
        img = Image.open(image_stream)
        img.load()
    except UnidentifiedImageError:
        return jsonify({'error': 'Export failed', 'details': 'unidentified_image'}), 400
    except Exception as e:
        return jsonify({'error': 'Export failed', 'details': f'image_open:{e}'}), 400

    try:
        dpi = int(data.get('dpi', 600))
    except (ValueError, TypeError):
        dpi = 600
    dpi = max(50, min(2400, dpi))

    if img.mode == 'RGBA' and fmt in {'jpeg', 'tiff', 'pdf'}:
        img = img.convert('RGB')

    output_buffer = io.BytesIO()
    try:
        if fmt == 'tiff':
            img.save(output_buffer, format='TIFF', dpi=(dpi, dpi), compression='tiff_lzw')
        elif fmt == 'pdf':
            img.save(output_buffer, format='PDF', resolution=dpi)
        elif fmt == 'jpeg':
            img.save(output_buffer, format='JPEG', dpi=(dpi, dpi), quality=95)
        else:
            img.save(output_buffer, format='PNG', dpi=(dpi, dpi))
    except Exception as e:
        current_app.logger.exception('Pillow save failed (legacy)')
        return jsonify({'error': 'Export failed', 'details': f'save_failed:{e}'}), 500

    output_buffer.seek(0)
    if request.args.get('mode') == 'json':
        b64 = base64.b64encode(output_buffer.getvalue()).decode('ascii')
        return jsonify({'ok': True, 'format': fmt, 'base64': b64})

    mime_map = { 'png': 'image/png', 'jpeg': 'image/jpeg', 'tiff': 'image/tiff', 'pdf': 'application/pdf' }
    resp = send_file(output_buffer, mimetype=mime_map[fmt], as_attachment=True, download_name=f'figure.{fmt}')
    resp.headers['Cache-Control'] = 'no-transform'
    return resp

@main_blueprint.route('/api/submit-feedback', methods=['POST'])
def submit_feedback():
    try:
        data = request.get_json()
        rating = data.get('rating')
        _ = data.get('feedback', '')  # feedback text (unused storage)
        current_app.logger.info(f"Feedback received rating={rating}")
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': 'Failed to submit feedback', 'details': str(e)}), 500


@main_blueprint.route('/api/convert-tiff', methods=['POST'])
def convert_tiff_to_png():
    """Accept a TIFF upload and return a PNG (base64) for maximum compatibility.

    This provides a server-side fallback for TIFFs that the browser decoder (tiff.js)
    cannot open, including BigTIFF, uncommon compressions, and 16/32-bit images.
    """
    try:
        upload = request.files.get('image')
        if not upload:
            return jsonify({'error': 'missing_file'}), 400

        # First attempt: Pillow (covers many TIFF variants, including BigTIFF)
        try:
            img = Image.open(upload.stream)
            try:
                # Use the first frame if multi-page
                if getattr(img, 'n_frames', 1) > 1:
                    img.seek(0)
            except Exception:
                pass

            # Normalize modes to ensure PNG compatibility
            if img.mode not in {'RGB', 'RGBA'}:
                # Convert everything to RGB to avoid mode pitfalls (e.g., I;16, F)
                img = img.convert('RGB')

            out = io.BytesIO()
            img.save(out, format='PNG')
            out.seek(0)
            b64 = base64.b64encode(out.getvalue()).decode('ascii')
            return jsonify({'ok': True, 'format': 'png', 'base64': b64})
        except UnidentifiedImageError:
            # Explicitly fall through to tifffile
            pass
        except Exception as e:
            # If Pillow fails for other reasons, try tifffile next
            current_app.logger.info(f"Pillow TIFF open failed, trying tifffile: {e}")

        # Second attempt: tifffile (optional dependency for broader support)
        try:
            import numpy as np  # type: ignore
            import tifffile as tiff  # type: ignore
        except Exception:
            current_app.logger.exception('tifffile or numpy not available for TIFF conversion fallback')
            return jsonify({'error': 'tiff_decode_failed', 'details': 'server_missing_tifffile'}), 500

        try:
            upload.stream.seek(0)
            with tiff.TiffFile(upload.stream) as tf:
                arr = tf.asarray()

            # Convert to uint8 RGB/L
            def to_uint8(a: 'np.ndarray') -> 'np.ndarray':
                if a.dtype == np.uint8:
                    return a
                a = a.astype(np.float32, copy=False)
                mn = float(a.min())
                mx = float(a.max())
                if not (mx > mn):
                    return np.zeros_like(a, dtype=np.uint8)
                scaled = (a - mn) * (255.0 / (mx - mn))
                return np.clip(scaled, 0, 255).astype(np.uint8)

            arr = to_uint8(arr)
            mode: Optional[str] = None
            if arr.ndim == 2:
                mode = 'L'
            elif arr.ndim == 3 and arr.shape[2] in (3, 4):
                mode = 'RGB' if arr.shape[2] == 3 else 'RGBA'
            else:
                # Attempt to reshape planar data (C,H,W) -> (H,W,C)
                if arr.ndim == 3 and arr.shape[0] in (3, 4):
                    arr = np.moveaxis(arr, 0, -1)
                    mode = 'RGB' if arr.shape[2] == 3 else 'RGBA'
                else:
                    # Fallback to grayscale
                    arr = arr.squeeze()
                    if arr.ndim != 2:
                        arr = arr[..., 0]
                    mode = 'L'

            pil_img = Image.fromarray(arr, mode=mode)
            if pil_img.mode not in {'RGB', 'RGBA'}:
                pil_img = pil_img.convert('RGB')
            out = io.BytesIO()
            pil_img.save(out, format='PNG')
            out.seek(0)
            b64 = base64.b64encode(out.getvalue()).decode('ascii')
            return jsonify({'ok': True, 'format': 'png', 'base64': b64})
        except Exception:
            current_app.logger.exception('TIFF conversion failed (tifffile fallback)')
            return jsonify({'error': 'tiff_decode_failed'}), 500
    except Exception:
        current_app.logger.exception('Unhandled convert-tiff error')
        return jsonify({'error': 'unhandled'}), 500