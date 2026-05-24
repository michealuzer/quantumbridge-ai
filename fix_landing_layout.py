import os
import re

file_path = 'stitch_screens/landing_page_cf30eeb862a24f0d81686bdf5005f465.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the layout
pattern = r'<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center min-h-\[calc\(100vh-150px\)\]">.*?<div class="lg:col-span-6">(.*?)<div class="lg:col-span-6">(.*?)</section>'

replacement = """<div class="relative z-10 max-w-4xl mx-auto w-full flex flex-col items-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-outline-variant/40 shadow-sm mb-5">
                <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span class="text-[10px] font-bold uppercase tracking-widest text-primary">AI Trading plans now open</span>
            </div>

            <h1 class="font-display text-[42px] leading-[44px] md:text-[70px] md:leading-[72px] font-bold mb-6 max-w-3xl text-center">
                Put your Trading to work every day
            </h1>

            <p class="font-body text-base md:text-xl text-on-surface/66 max-w-2xl leading-8 mb-5 text-center">
                QuantumTrade gives investors a clear place to start, track, and manage AI-assisted Trading trading plans. Choose a plan, follow daily account credits, and keep your trade history, withdrawals, and security records in one private dashboard.
            </p>

            <div class="flex flex-wrap justify-center gap-2 mb-7">
                <span class="px-3 py-2 rounded-full bg-white border border-outline-variant/35 text-xs font-bold text-on-surface/65 shadow-sm">Plans from $10</span>
                <span class="px-3 py-2 rounded-full bg-white border border-outline-variant/35 text-xs font-bold text-on-surface/65 shadow-sm">Daily dashboard updates</span>
                <span class="px-3 py-2 rounded-full bg-white border border-outline-variant/35 text-xs font-bold text-on-surface/65 shadow-sm">Private user funds</span>
            </div>

            <div class="flex flex-col sm:flex-row justify-center gap-3 mb-7 w-full sm:w-auto">
                <a href="#/signup" class="inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 hover:bg-primary-container transition-colors">
                    <span class="material-symbols-outlined text-[20px]">rocket_launch</span>
                    Get Early Access
                </a>
                <a href="#/explorer" class="inline-flex items-center justify-center gap-2 px-6 py-4 bg-white text-on-surface rounded-lg font-bold border border-outline-variant/40 shadow-sm hover:bg-surface-container-low transition-colors">
                    <span class="material-symbols-outlined text-[20px]">payments</span>
                    Compare Plans
                </a>
                <a href="#/login" class="inline-flex items-center justify-center gap-2 px-6 py-4 bg-on-surface text-white rounded-lg font-bold shadow-lg shadow-on-surface/10 hover:bg-on-surface/90 transition-colors">
                    <span class="material-symbols-outlined text-[20px]">login</span>
                    Login
                </a>
            </div>

            <div class="grid grid-cols-3 gap-3 max-w-2xl w-full">
                <div class="bg-white/90 border border-outline-variant/35 rounded-lg p-4 shadow-sm text-center">
                    <p class="text-[10px] font-bold uppercase text-on-surface/42">Featured</p>
                    <p class="font-display text-2xl md:text-3xl font-bold text-primary mt-1">3%</p>
                    <p class="text-xs text-on-surface/50 mt-1">daily credit</p>
                </div>
                <div class="bg-white/90 border border-outline-variant/35 rounded-lg p-4 shadow-sm text-center">
                    <p class="text-[10px] font-bold uppercase text-on-surface/42">Visibility</p>
                    <p class="font-display text-2xl md:text-3xl font-bold mt-1">24/7</p>
                    <p class="text-xs text-on-surface/50 mt-1">account access</p>
                </div>
                <div class="bg-white/90 border border-outline-variant/35 rounded-lg p-4 shadow-sm text-center">
                    <p class="text-[10px] font-bold uppercase text-on-surface/42">Term</p>
                    <p class="font-display text-2xl md:text-3xl font-bold mt-1">14-120</p>
                    <p class="text-xs text-on-surface/50 mt-1">day options</p>
                </div>
            </div>
        </div>
    </section>"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated Layout")
