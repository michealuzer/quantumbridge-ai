import os
import glob
import re

html_files = glob.glob('stitch_screens/landing_page_*.html')

for file_path in html_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace Create Free Account with Get Early Access
    content = content.replace('Create Free Account', 'Get Early Access')
    # Replace the "Active Funds $500" section in the image with more generic marketing copy
    content = content.replace('ACTIVE FUNDS', 'STARTING FROM')
    content = content.replace('$500', '$10')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Updated Landing Copy")
