import os
import glob
import re

html_files = glob.glob('*.html') + glob.glob('stitch_screens/*.html')

replacements = {
    r'\$500(?!\d)': '$10',
    r'\$2,500(?!\d)': '$100',
    r'\$10,000(?!\d)': '$500',
    r'\$18,000(?!\d)': '$900',
    r'\$50,000(?!\d)': '$1,000',
    r'\$11,250(?!\d)': '$50',
    r'\$61,250(?!\d)': '$1,050',
}

for file_path in html_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for old, new in replacements.items():
        content = re.sub(old, new, content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Replaced Tiers")
