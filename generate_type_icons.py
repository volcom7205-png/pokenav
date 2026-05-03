import os
from PIL import Image, ImageDraw, ImageFont

types_info = {
    "fighting": "#E64A19",
    "psychic": "#F06292",
    "poison": "#AB47BC",
    "dragon": "#5C6BC0",
    "ghost": "#7E57C2",
    "dark": "#546E7A",
    "ground": "#A1887F",
    "fire": "#FF7043",
    "fairy": "#F48FB1",
    "water": "#4FC3F7",
    "flying": "#81D4FA",
    "normal": "#B0BEC5",
    "rock": "#8D6E63",
    "electric": "#FFF176",
    "bug": "#AED581",
    "grass": "#81C784",
    "ice": "#80DEEA",
    "steel": "#90A4AE"
}

def draw_icon(type_name, color, size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    padding = 40
    points = [
        (size // 2, padding),
        (size - padding, size // 3),
        (size - padding, 2 * size // 3),
        (size // 2, size - padding),
        (padding, 2 * size // 3),
        (padding, size // 3)
    ]
    draw.polygon(points, fill="#1A1A1A", outline=color, width=15)
    center = size // 2
    s = size // 4

    if type_name == "fire":
        draw.polygon([(center, center-s), (center+s, center+s), (center, center+s//2), (center-s, center+s)], fill=color)
    elif type_name == "water":
        draw.ellipse([center-s, center-s+20, center+s, center+s+20], fill=color)
        draw.polygon([(center, center-s-20), (center-s, center), (center+s, center)], fill=color)
    elif type_name == "electric":
        draw.polygon([(center-10, center-s-20), (center+s, center-10), (center, center), (center+20, center+s+20), (center-s, center+10), (center, center)], fill=color)
    elif type_name == "grass":
        draw.chord([center-s, center-s, center+s, center+s], 45, 225, fill=color)
        draw.line([center-s, center+s, center+s, center-s], fill=color, width=10)
    elif type_name == "dark":
        draw.ellipse([center-s, center-s, center+s, center+s], fill=color)
        draw.ellipse([center-s+30, center-s, center+s+30, center+s], fill="#1A1A1A")
    elif type_name == "fighting":
        draw.rectangle([center-s, center-s, center+s, center+s//2], fill=color)
        draw.rectangle([center-s, center+s//2+10, center-s+20, center+s], fill=color)
        draw.rectangle([center-s+30, center+s//2+10, center-s+50, center+s], fill=color)
        draw.rectangle([center-s+60, center+s//2+10, center-s+80, center+s], fill=color)
    elif type_name == "poison":
        draw.ellipse([center-s, center-s, center+s, center+s//2], fill=color)
        draw.rectangle([center-s+20, center+s//2, center+s-20, center+s], fill=color)
    elif type_name == "psychic":
        draw.ellipse([center-s, center-s, center+s, center+s], outline=color, width=20)
        draw.ellipse([center-s//2, center-s//2, center+s//2, center+s//2], fill=color)
    elif type_name == "ghost":
        draw.ellipse([center-s, center-s, center+s, center+s], fill=color)
        draw.ellipse([center-40, center-20, center-10, center+10], fill="#1A1A1A")
        draw.ellipse([center+10, center-20, center+40, center+10], fill="#1A1A1A")
    elif type_name == "dragon":
        draw.polygon([(center, center-s), (center+s, center), (center, center+s), (center-s//2, center)], fill=color)
    elif type_name == "fairy":
        pts = [(center, center-s-20), (center+20, center-20), (center+s+20, center), (center+20, center+20), (center, center+s+20), (center-20, center+20), (center-s-20, center), (center-20, center-20)]
        draw.polygon(pts, fill=color)
    elif type_name == "flying":
        draw.polygon([(center-s, center), (center+s, center-s), (center+s, center+s)], fill=color)
    elif type_name == "normal":
        draw.ellipse([center-s, center-s, center+s, center+s], outline=color, width=30)
    elif type_name == "ground":
        draw.polygon([(center-s, center+s), (center, center-s), (center+s, center+s)], fill=color)
    elif type_name == "rock":
        draw.polygon([(center, center-s), (center+s, center), (center, center+s), (center-s, center)], fill=color)
    elif type_name == "bug":
        draw.ellipse([center-s//2, center-s//2, center+s//2, center+s//2], fill=color)
        draw.line([center-s, center-s, center-10, center-10], fill=color, width=15)
        draw.line([center+s, center-s, center+10, center-10], fill=color, width=15)
    elif type_name == "ice":
        draw.line([center-s, center, center+s, center], fill=color, width=15)
        draw.line([center, center-s, center, center+s], fill=color, width=15)
        draw.line([center-s//1.5, center-s//1.5, center+s//1.5, center+s//1.5], fill=color, width=15)
    elif type_name == "steel":
        draw.regular_polygon((center, center, s), 6, fill=color)
        draw.ellipse([center-15, center-15, center+15, center+15], fill="#1A1A1A")

    return img

for t_name, t_color in types_info.items():
    icon_img = draw_icon(t_name, t_color)
    filename = f"{t_name}.png"
    icon_img.save(filename)

print("Done")
