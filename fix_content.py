import os
import glob
import re

html_files = glob.glob('*.html') + glob.glob('stitch_screens/*.html')

for file_path in html_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace Bitcoin -> Trading
    content = content.replace('Bitcoin', 'Trading')
    content = content.replace('bitcoin', 'trading')
    # Maybe replace BTC with something neutral like 'USD' or 'Assets'
    content = content.replace('BTC/USD', 'ASSET/USD')
    content = content.replace('BTC wallet', 'Trading account')
    content = content.replace(' BTC', ' TRD')
    content = content.replace('currency_bitcoin', 'show_chart')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Replaced Bitcoin -> Trading")
