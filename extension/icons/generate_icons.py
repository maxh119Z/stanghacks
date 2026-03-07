from PIL import Image, ImageDraw, ImageFont
import os

for size in [48, 128]:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background circle
    padding = size // 10
    draw.ellipse([padding, padding, size - padding, size - padding], fill='#4f46e5')
    
    # Inner circle
    inner_p = size // 4
    draw.ellipse([inner_p, inner_p, size - inner_p, size - inner_p], fill='#818cf8')
    
    # Center dot
    center_p = size * 3 // 8
    draw.ellipse([center_p, center_p, size - center_p, size - center_p], fill='#e0e7ff')
    
    img.save(f'/home/claude/brainrot-guard/icons/icon{size}.png')

print("Icons generated")
