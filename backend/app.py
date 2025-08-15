from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import pandas as pd
from io import BytesIO
from utils import compare_buca_jovie
import json

import os
CORRECTIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corrections.json')

def save_corrections_to_disk():
    print("Saving corrections to:", os.path.abspath(CORRECTIONS_FILE))
    with open(CORRECTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(DATA['corrections'], f, ensure_ascii=False, indent=2)

def load_corrections_from_disk():
    try:
        with open(CORRECTIONS_FILE, 'r', encoding='utf-8') as f:
            DATA['corrections'] = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        DATA['corrections'] = []

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# --- License validation (simple static for now) ---
LICENSE_KEY = os.environ.get('CASECON_LICENSE_KEY', 'supercalifragilisticexpialidocious')

# --- In-memory storage (for demo; replace with DB in prod) ---
DATA = {
    'buca': None,
    'jovie': None,
    'corrections': [],
    'compare_results': None,
}

# Load corrections from disk at startup
load_corrections_from_disk()

@app.route('/')
def index():
    return {'status': 'CaseCon backend running'}

@app.route('/license', methods=['POST'])
def validate_license():
    data = request.get_json()
    key = data.get('key')
    valid = bool(key and key == LICENSE_KEY)
    return jsonify({'valid': valid})

@app.route('/upload', methods=['POST'])
def upload():
    # Accept either files or plain text JSON for buca/jovie
    if request.content_type and 'application/json' in request.content_type:
        data = request.get_json()
        buca_text = data.get('buca_text')
        jovie_text = data.get('jovie_text')
        # Parse lines to DataFrames (simple: one per line, columns: Name)
        if buca_text:
            buca_lines = [l.strip() for l in buca_text.split('\n') if l.strip()]
            DATA['buca'] = pd.DataFrame({'Name': buca_lines})
        if jovie_text:
            jovie_lines = [l.strip() for l in jovie_text.split('\n') if l.strip()]
            DATA['jovie'] = pd.DataFrame({'Name': jovie_lines})
        if DATA['buca'] is None and DATA['jovie'] is None:
            return jsonify({'error': 'No data provided.'}), 400
        return jsonify({'success': True})
    else:
        # Fallback: Excel upload
        buca_file = request.files.get('buca')
        jovie_file = request.files.get('jovie')
        if not buca_file or not jovie_file:
            return jsonify({'error': 'Both BUCA and JOVIE files required.'}), 400
        try:
            buca_df = pd.read_excel(buca_file)
            jovie_df = pd.read_excel(jovie_file)
            # Try to standardize columns for BUCA
            buca_cols = [c.lower() for c in buca_df.columns]
            if 'client' in buca_cols and 'caregivers' in buca_cols:
                buca_df.columns = [c.capitalize() for c in buca_cols]
            elif 'name' in buca_cols and 'caregiver' in buca_cols:
                buca_df = buca_df.rename(columns={'name': 'Client', 'caregiver': 'Caregiver'})
            elif 'client' in buca_cols and 'caregivers' in buca_cols:
                buca_df = buca_df.rename(columns={'client': 'Client', 'caregivers': 'Caregiver'})
            else:
                return jsonify({'error': 'BUCA file must have columns: Client and Caregiver'}), 400
            # Try to standardize columns for JOVIE
            jovie_cols = [c.lower() for c in jovie_df.columns]
            if 'client' in jovie_cols and 'caregiver' in jovie_cols:
                jovie_df.columns = [c.capitalize() for c in jovie_cols]
            elif 'name' in jovie_cols and 'caregiver' in jovie_cols:
                jovie_df = jovie_df.rename(columns={'name': 'Client', 'caregiver': 'Caregiver'})
            elif 'client' in jovie_cols and 'caregivers' in jovie_cols:
                jovie_df = jovie_df.rename(columns={'client': 'Client', 'caregivers': 'Caregiver'})
            else:
                return jsonify({'error': 'JOVIE file must have columns: Client and Caregiver'}), 400
            DATA['buca'] = buca_df
            DATA['jovie'] = jovie_df
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/compare', methods=['POST'])
def compare():
    # Accept direct JSON rows (legacy/text workflow)
    if request.is_json:
        data = request.get_json()
        bucaRows = data.get('bucaRows')
        jovieRows = data.get('jovieRows')
        corrections = DATA['corrections']
        import pandas as pd
        if not bucaRows or not jovieRows:
            return jsonify({'error': 'Both BUCA and JOVIE data required'}), 400
        # Ensure DataFrame type
        if isinstance(bucaRows, list):
            buca_df = pd.DataFrame(bucaRows)
        else:
            buca_df = bucaRows
        if isinstance(jovieRows, list):
            jovie_df = pd.DataFrame(jovieRows)
        else:
            jovie_df = jovieRows
        # Standardize columns for compare_buca_jovie
        if 'client' in buca_df.columns and 'caregivers' in buca_df.columns:
            buca_df = buca_df.rename(columns={'client': 'Client', 'caregivers': 'Caregiver'})
        elif 'client' in buca_df.columns and 'caregiver' in buca_df.columns:
            buca_df = buca_df.rename(columns={'client': 'Client', 'caregiver': 'Caregiver'})
        else:
            return jsonify({'error': 'BUCA data must have client and caregiver(s) columns'}), 400
        if 'client' in jovie_df.columns and 'caregiver' in jovie_df.columns:
            jovie_df = jovie_df.rename(columns={'client': 'Client', 'caregiver': 'Caregiver'})
        else:
            return jsonify({'error': 'JOVIE data must have client and caregiver columns'}), 400
        # Flatten any list values in 'Caregiver' columns to comma-separated strings
        def flatten_caregivers(df):
            if 'Caregiver' in df.columns:
                df['Caregiver'] = df['Caregiver'].apply(
                    lambda x: ', '.join(x) if isinstance(x, list) else (x if x is not None else '')
                )
            return df
        buca_df = flatten_caregivers(buca_df)
        jovie_df = flatten_caregivers(jovie_df)
        results = compare_buca_jovie(buca_df, jovie_df, corrections)
        DATA['compare_results'] = results
        return jsonify(results)
    # Fallback: Use cached DATA
    buca_df = DATA['buca']
    jovie_df = DATA['jovie']
    corrections = DATA['corrections']
    if buca_df is None or jovie_df is None:
        return jsonify({'error': 'No data uploaded'}), 400
    results = compare_buca_jovie(buca_df, jovie_df, corrections)
    DATA['compare_results'] = results
    return jsonify(results)


@app.route('/corrections', methods=['GET', 'POST'])
def corrections():
    if request.method == 'GET':
        return jsonify({'corrections': DATA['corrections']})
    # POST: Update corrections
    data = request.get_json()
    print("Received corrections (corrections endpoint):", data)
    DATA['corrections'] = data.get('corrections', [])
    save_corrections_to_disk()
    return jsonify({'success': True})

@app.route('/add_correction', methods=['POST'])
def add_correction():
    data = request.get_json()
    print("Received correction for add:", data)
    correction = data.get('correction')
    if not correction:
        return jsonify({'error': 'No correction provided'}), 400
    # Only keep type, buca, jovie fields
    filtered = {k: correction[k] for k in ['type', 'buca', 'jovie'] if k in correction}
    DATA['corrections'].append(filtered)
    save_corrections_to_disk()
    return jsonify({'success': True})

@app.route('/delete_correction', methods=['POST'])
def delete_correction():
    data = request.get_json()
    print("Received correction for delete:", data)
    correction = data.get('correction')
    # Only keep type, buca, jovie fields for matching
    if correction:
        correction = {k: correction[k] for k in ['type', 'buca', 'jovie'] if k in correction}
    def correction_matches(a, b):
        if not a or not b:
            return False
        if a.get('type') is None or b.get('type') is None:
            return False
        if a.get('type') != b.get('type'):
            return False
        return a.get('buca') == b.get('buca') and a.get('jovie') == b.get('jovie')
    before = len(DATA['corrections'])
    DATA['corrections'] = [
        c for c in DATA['corrections']
        if not correction_matches({k: c.get(k) for k in ['type', 'buca', 'jovie']}, correction)
    ]
    save_corrections_to_disk()
    return jsonify({'success': True, 'removed': before - len(DATA['corrections'])})


@app.route('/export', methods=['GET'])
def export():
    # TODO: Use DATA['compare_results'] to generate Excel
    # For now, generate dummy Excel file
    df = pd.DataFrame({'Matched': ['Example1', 'Example2']})
    output = BytesIO()
    df.to_excel(output, index=False)
    output.seek(0)
    return send_file(output, download_name='CaseConResults.xlsx', as_attachment=True)

import re
import uuid

@app.route('/process_buca', methods=['POST'])
def process_buca():
    data = request.get_json()
    buca_text = data.get('buca_text', '')
    buca_lines = [l.strip() for l in buca_text.split('\n') if l.strip()]
    rows = []
    # More robust parsing for BUCA lines
    def parse_buca_line(line):
        import re
        # Find the case number: starts with '00' + letter or digit, or 'CAS', then dash, then alphanum/dash
        case_number_pattern = r'((?:00[a-zA-Z0-9]|CAS)[-A-Z0-9]+?)(?=\s|Date|ESTCaregiver|$)'
        case_number_match = re.search(case_number_pattern, line)
        if not case_number_match:
            return {
                'client': '',
                'caregivers': [],
                'caseNumber': '',
                'is_valid': False,
                'raw': line
            }
        case_number = case_number_match.group(1)
        client = line[:case_number_match.start()].strip()
        # Find caregivers
        cg_match = re.search(r'ESTCaregiver:\s*(.+)$', line)
        caregivers = []
        if cg_match:
            caregivers_raw = cg_match.group(1)
            caregivers = [cg.strip() for cg in re.split(r'[,/&]| and ', caregivers_raw) if cg.strip()]
        is_valid = bool(client and case_number and caregivers)
        return {
            'client': client,
            'caregivers': caregivers,
            'caseNumber': case_number,
            'is_valid': is_valid,
            'raw': line
        }
    rows = []
    for idx, line in enumerate(buca_lines):
        parsed = parse_buca_line(line)
        parsed['row'] = idx + 1
        rows.append(parsed)

    DATA['buca'] = rows
    return jsonify({'rows': rows})

@app.route('/process_jovie', methods=['POST'])
def process_jovie():
    data = request.get_json()
    jovie_text = data.get('jovie_text', '')
    lines = [line.rstrip() for line in jovie_text.split('\n')]
    # Extract date if present on first non-empty line (supports 'Mon, Aug, 4th' or 'MM/DD/YYYY')
    date = None
    date_pattern1 = r'^(\d{1,2}/\d{1,2}/\d{4})$'  # MM/DD/YYYY
    date_pattern2 = r'^[A-Za-z]{3},\s+[A-Za-z]{3},\s+\d{1,2}(st|nd|rd|th)?$'  # Mon, Aug, 4th
    first_idx = next((i for i, l in enumerate(lines) if l.strip()), None)
    if first_idx is not None:
        line = lines[first_idx].strip()
        if re.match(date_pattern1, line) or re.match(date_pattern2, line):
            date = line
            lines[first_idx] = ''
    rows = []
    rownum = 1
    i = 0
    n = len(lines)
    # Skip date if present
    while i < n and not lines[i].strip():
        i += 1
    if i < n and (re.match(date_pattern1, lines[i].strip()) or re.match(date_pattern2, lines[i].strip())):
        i += 1
    # Parse blocks
    while i < n:
        # Collect 3 non-empty lines as a block
        block = []
        while i < n and len(block) < 3:
            if lines[i].strip():
                block.append(lines[i].strip())
            i += 1
        if len(block) == 3:
            rows.append({
                'row': rownum,
                'client': block[0],
                'caregiver': block[1],
                'time': block[2],
            })
            rownum += 1
        # Skip remaining lines in this block until a blank line or end
        while i < n and lines[i].strip():
            i += 1
        # Skip any blank lines between blocks
        while i < n and not lines[i].strip():
            i += 1
    DATA['jovie'] = rows
    return jsonify({'rows': rows, 'date': date})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
