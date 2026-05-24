import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Title
content = re.sub(r'<title>.*?</title>', '<title>QuantumBridge | Real Estate Debt Investing</title>', content)

# Replace the aurora background with the image background
aurora_pattern = r'<!-- Quantum Aurora Background -->.*?</div>.*?</div>.*?</div>.*?</div>'
replacement = """<!-- Real Estate Cinematic Background -->
    <div class="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-on-surface">
        <div class="absolute inset-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-40 animate-pan-slow"></div>
        <div class="absolute inset-0 bg-surface/85 backdrop-blur-[2px]"></div>
        
        <!-- Grain Texture -->
        <div class="absolute inset-0 opacity-[0.03] mix-blend-overlay" style="background-image: url('data:image/svg+xml,%3Csvg viewBox=\\'0 0 200 200\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cfilter id=\\'noiseFilter\\'%3E%3CfeTurbulence type=\\'fractalNoise\\' baseFrequency=\\'0.65\\' numOctaves=\\'3\\' stitchTiles=\\'stitch\\'/%3E%3C/filter%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' filter=\\'url(%23noiseFilter)\\'/%3E%3C/svg%3E');"></div>
    </div>"""

content = re.sub(aurora_pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated index.html background")
