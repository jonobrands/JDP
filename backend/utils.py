import pandas as pd

def apply_corrections(df, corrections, col):
    """
    Applies universal name corrections to a DataFrame column, case-insensitive.
    df: pandas DataFrame
    corrections: list of {type, buca, jovie}
    col: column name to apply corrections to ('Client' or 'Caregiver')
    """
    if not corrections or col not in df.columns:
        return df
    # Determine which corrections to use based on type
    corr_type = 'client' if col.lower() == 'client' else 'caregiver'
    mapping = {c['buca'].strip().lower(): c['jovie'] for c in corrections if c.get('type') == corr_type and c.get('buca') and c.get('jovie')}
    def correct_val(val):
        if isinstance(val, str) and val.strip().lower() in mapping:
            return mapping[val.strip().lower()]
        return val
    df[col] = df[col].apply(correct_val)
    return df

import difflib

def compare_buca_jovie(buca_df, jovie_df, corrections):
    """
    Compares BUCA and JOVIE dataframes after applying corrections.
    Returns a list of dicts, each with: source, client, caregiver, match_type, tag, confidence.
    """
    # For this logic, expect columns: Client, Caregiver (BUCA); Client, Caregiver (JOVIE)
    # Apply corrections to both Caregiver and Client columns, case-insensitive
    buca = buca_df.copy()
    jovie = jovie_df.copy()
    buca = apply_corrections(buca, corrections, 'Caregiver')
    buca = apply_corrections(buca, corrections, 'Client')
    jovie = apply_corrections(jovie, corrections, 'Caregiver')
    jovie = apply_corrections(jovie, corrections, 'Client')
    # Build lowercased client and caregiver sets and mappings for case-insensitive matching
    buca_client_map = {str(c).strip().lower(): c for c in buca['Client']} if 'Client' in buca.columns else {}
    jovie_client_map = {str(c).strip().lower(): c for c in jovie['Client']} if 'Client' in jovie.columns else {}
    buca_caregiver_map = {str(c).strip().lower(): c for c in buca['Caregiver']} if 'Caregiver' in buca.columns else {}
    jovie_caregiver_map = {str(c).strip().lower(): c for c in jovie['Caregiver']} if 'Caregiver' in jovie.columns else {}
    buca_clients = set(buca_client_map.keys())
    jovie_clients = set(jovie_client_map.keys())
    results = []
    # Exact matches (Green)
    for client_lc in buca_clients & jovie_clients:
        buca_client = buca_client_map[client_lc]
        jovie_client = jovie_client_map[client_lc]
        buca_cg = str(buca[buca['Client'] == buca_client]['Caregiver'].iloc[0])
        jovie_cg = str(jovie[jovie['Client'] == jovie_client]['Caregiver'].iloc[0])
        # Compare case-insensitive
        if buca_cg.strip().lower() == jovie_cg.strip().lower():
            results.append({
                'source': 'BOTH',
                'client': buca_client,
                'caregiver': buca_cg,
                'match_type': 'Exact Match',
                'tag': 'exact_match',
                'confidence': 1.0
            })
        elif (',' in buca_cg or '/' in buca_cg or '&' in buca_cg):
            # Multiple caregivers unresolved (Blue)
            results.append({
                'source': 'BUCA',
                'client': buca_client,
                'caregiver': buca_cg,
                'match_type': 'Verify Which CG',
                'tag': 'verify_cg',
                'confidence': 0.7
            })
        else:
            # Fuzzy caregiver match (Purple)
            similarity = difflib.SequenceMatcher(None, buca_cg.lower(), jovie_cg.lower()).ratio()
            if similarity >= 0.6:
                results.append({
                    'source': 'BUCA',
                    'client': buca_client,
                    'caregiver': buca_cg,
                    'match_type': 'Temporary Mismatch',
                    'tag': 'temp_mismatch',
                    'confidence': 0.7
                })
                results.append({
                    'source': 'JOVIE',
                    'client': buca_client,
                    'caregiver': jovie_cg,
                    'match_type': 'Temporary Mismatch',
                    'tag': 'temp_mismatch',
                    'confidence': 0.7
                })
            else:
                # Same client, different caregiver (Yellow)
                results.append({
                    'source': 'BUCA',
                    'client': buca_client,
                    'caregiver': buca_cg,
                    'match_type': 'Caregiver Mismatch',
                    'tag': 'diff_caregiver_mismatch',
                    'confidence': 0.7
                })
                results.append({
                    'source': 'JOVIE',
                    'client': buca_client,
                    'caregiver': jovie_cg,
                    'match_type': 'Caregiver Mismatch',
                    'tag': 'diff_caregiver_mismatch',
                    'confidence': 0.7
                })
    # Fuzzy client matches (Purple)
    fuzzy_threshold = 0.6
    unmatched_buca = buca_clients - jovie_clients
    unmatched_jovie = jovie_clients - buca_clients
    for client_lc in unmatched_buca:
        matches = difflib.get_close_matches(client_lc, list(unmatched_jovie), n=1, cutoff=fuzzy_threshold)
        buca_client = buca_client_map[client_lc]
        buca_cg = str(buca[buca['Client'] == buca_client]['Caregiver'].iloc[0])
        buca_cg_lc = buca_cg.strip().lower()
        if matches:
            jovie_client = jovie_client_map[matches[0]]
            jovie_cg = str(jovie[jovie['Client'] == jovie_client]['Caregiver'].iloc[0])
            jovie_cg_lc = jovie_cg.strip().lower()
            if buca_cg_lc == jovie_cg_lc:
                # If caregivers match (case-insensitive), treat as temporary mismatch
                results.append({
                    'source': 'BUCA',
                    'client': buca_client,
                    'caregiver': buca_cg,
                    'match_type': 'Temporary Mismatch',
                    'tag': 'temp_mismatch',
                    'confidence': 0.7
                })
                results.append({
                    'source': 'JOVIE',
                    'client': jovie_client,
                    'caregiver': jovie_cg,
                    'match_type': 'Temporary Mismatch',
                    'tag': 'temp_mismatch',
                    'confidence': 0.7
                })
                unmatched_jovie.remove(matches[0])
            else:
                # Caregivers don't match, treat as complete mismatch for both
                results.append({
                    'source': 'Missing in JOVIE',
                    'client': buca_client,
                    'caregiver': buca_cg,
                    'match_type': 'Complete Mismatch',
                    'tag': 'complete_mismatch',
                    'confidence': 0.0
                })
        else:
            results.append({
                'source': 'Missing in JOVIE',
                'client': buca_client,
                'caregiver': buca_cg,
                'match_type': 'Complete Mismatch',
                'tag': 'complete_mismatch',
                'confidence': 0.0
            })
    for client_lc in unmatched_jovie:
        jovie_client = jovie_client_map[client_lc]
        jovie_cg = str(jovie[jovie['Client'] == jovie_client]['Caregiver'].iloc[0])
        jovie_cg_lc = jovie_cg.strip().lower()
        # Try to find a matching caregiver in BUCA (case-insensitive)
        if jovie_cg_lc in buca_caregiver_map:
            # If found, treat as temporary mismatch
            results.append({
                'source': 'BUCA',
                'client': '',  # No matching client
                'caregiver': buca_caregiver_map[jovie_cg_lc],
                'match_type': 'Temporary Mismatch',
                'tag': 'temp_mismatch',
                'confidence': 0.7
            })
            results.append({
                'source': 'JOVIE',
                'client': jovie_client,
                'caregiver': jovie_cg,
                'match_type': 'Temporary Mismatch',
                'tag': 'temp_mismatch',
                'confidence': 0.7
            })
        else:
            results.append({
                'source': 'Missing in BUCA',
                'client': jovie_client,
                'caregiver': jovie_cg,
                'match_type': 'Complete Mismatch',
                'tag': 'complete_mismatch',
                'confidence': 0.0
            })
    return results

