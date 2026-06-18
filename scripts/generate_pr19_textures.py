from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TEXTURE_ROOT = ROOT / "public" / "assets" / "textures"

TRANSPARENT = (0, 0, 0, 0)
OUTLINE = (31, 35, 42, 255)
IRON_DARK = (73, 82, 92, 255)
IRON_MID = (145, 155, 164, 255)
IRON_LIGHT = (218, 225, 228, 255)
IRON_GLEAM = (245, 248, 249, 255)


def canvas(opaque=False):
    return Image.new("RGBA", (16, 16), OUTLINE if opaque else TRANSPARENT)


def save(image, relative_path):
    destination = TEXTURE_ROOT / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)


def draw_magnet(core, glow, path):
    image = canvas(True)
    draw = ImageDraw.Draw(image)
    draw.rectangle((1, 1, 14, 14), fill=(47, 54, 63, 255))
    draw.rectangle((2, 2, 13, 13), fill=(91, 101, 111, 255))
    draw.rectangle((3, 3, 12, 12), fill=(42, 48, 57, 255))
    draw.rectangle((4, 4, 11, 11), fill=core)
    draw.rectangle((5, 5, 10, 10), fill=(73, 28, 30, 255) if core[0] > core[2] else (25, 52, 82, 255))
    draw.rectangle((6, 6, 9, 9), fill=core)
    draw.point((6, 6), fill=glow)
    draw.point((7, 6), fill=glow)
    draw.point((4, 4), fill=glow)
    draw.point((11, 11), fill=(20, 23, 29, 255))
    for point in ((2, 2), (13, 2), (2, 13), (13, 13)):
        draw.point(point, fill=IRON_LIGHT)
    for point in ((3, 2), (2, 3), (12, 13), (13, 12)):
        draw.point(point, fill=IRON_DARK)
    save(image, path)


def draw_iron_helmet():
    image = canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(3, 5), (5, 3), (10, 3), (12, 5), (12, 11), (10, 11),
                  (10, 8), (6, 8), (6, 11), (3, 11)], fill=OUTLINE)
    draw.polygon([(4, 5), (6, 4), (9, 4), (11, 5), (11, 7), (9, 6),
                  (6, 6), (4, 7)], fill=IRON_MID)
    draw.rectangle((4, 7, 5, 10), fill=IRON_DARK)
    draw.rectangle((10, 7, 11, 10), fill=IRON_DARK)
    draw.rectangle((6, 4, 8, 4), fill=IRON_LIGHT)
    draw.point((5, 5), fill=IRON_GLEAM)
    draw.point((10, 5), fill=IRON_LIGHT)
    save(image, "items/iron_helmet.png")


def draw_iron_chestplate():
    image = canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(4, 3), (6, 2), (9, 2), (11, 3), (13, 6), (11, 8),
                  (11, 13), (4, 13), (4, 8), (2, 6)], fill=OUTLINE)
    draw.polygon([(5, 3), (6, 3), (7, 5), (8, 5), (9, 3), (10, 3),
                  (12, 6), (10, 7), (10, 12), (5, 12), (5, 7), (3, 6)], fill=IRON_MID)
    draw.rectangle((6, 6, 9, 11), fill=(121, 132, 142, 255))
    draw.line((7, 6, 7, 11), fill=IRON_DARK)
    draw.line((5, 4, 5, 10), fill=IRON_LIGHT)
    draw.point((6, 3), fill=IRON_GLEAM)
    draw.point((10, 4), fill=IRON_LIGHT)
    save(image, "items/iron_chestplate.png")


def draw_iron_leggings():
    image = canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(4, 3), (11, 3), (11, 8), (10, 13), (7, 13), (7, 9),
                  (6, 13), (3, 13), (4, 8)], fill=OUTLINE)
    draw.rectangle((5, 4, 10, 7), fill=IRON_MID)
    draw.polygon([(4, 7), (6, 7), (6, 12), (4, 12)], fill=IRON_MID)
    draw.polygon([(9, 7), (11, 7), (10, 12), (8, 12)], fill=(121, 132, 142, 255))
    draw.line((5, 4, 9, 4), fill=IRON_LIGHT)
    draw.point((5, 8), fill=IRON_GLEAM)
    draw.point((9, 8), fill=IRON_LIGHT)
    save(image, "items/iron_leggings.png")


def draw_boots(path, left_accent=None, right_accent=None):
    image = canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(3, 4), (7, 4), (7, 10), (6, 12), (2, 12), (2, 9), (3, 8)], fill=OUTLINE)
    draw.polygon([(9, 4), (12, 4), (12, 8), (14, 9), (14, 12), (9, 12)], fill=OUTLINE)
    draw.polygon([(4, 5), (6, 5), (6, 9), (5, 11), (3, 11), (3, 9), (4, 8)],
                 fill=left_accent or IRON_MID)
    draw.polygon([(10, 5), (11, 5), (11, 9), (13, 10), (13, 11), (10, 11)],
                 fill=right_accent or (121, 132, 142, 255))
    draw.point((4, 5), fill=IRON_GLEAM)
    draw.point((10, 5), fill=IRON_LIGHT)
    draw.line((3, 11, 6, 11), fill=IRON_DARK)
    draw.line((10, 11, 13, 11), fill=IRON_DARK)
    save(image, path)


def main():
    draw_magnet((205, 48, 51, 255), (255, 157, 128, 255), "blocks/positive_magnet.png")
    draw_magnet((38, 107, 190, 255), (117, 220, 255, 255), "blocks/negative_magnet.png")
    draw_iron_helmet()
    draw_iron_chestplate()
    draw_iron_leggings()
    draw_boots("items/iron_boots.png")
    draw_boots(
        "items/polarity_boots.png",
        left_accent=(194, 44, 54, 255),
        right_accent=(35, 106, 194, 255),
    )


if __name__ == "__main__":
    main()
