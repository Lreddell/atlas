package dev.atlas.client;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

public final class AtlasSettingsScreen extends Screen {
  private final Screen parent;

  public AtlasSettingsScreen(Screen parent) {
    super(Text.literal("Atlas · Light & Polarity"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    var c = AtlasConfig.INSTANCE;
    int x = width / 2 - 155, y = Math.max(30, (height - 180) / 2);
    add(x, y, "Atlas music: " + on(c.music), () -> c.music = !c.music);
    add(x + 160, y, "Night pitch: " + on(c.nightPitch), () -> c.nightPitch = !c.nightPitch);
    add(
        x,
        y + 25,
        "Music delay: " + c.musicDelaySeconds + "s",
        () ->
            c.musicDelaySeconds =
                switch (c.musicDelaySeconds) {
                  case 0 -> 5;
                  case 5 -> 15;
                  case 15 -> 30;
                  case 30 -> 60;
                  default -> 0;
                });
    add(x + 160, y + 25, "Cinematics: " + on(c.cinematics), () -> c.cinematics = !c.cinematics);
    add(
        x,
        y + 50,
        "Camera arm: " + c.cameraDistance,
        () -> c.cameraDistance = c.cameraDistance < 5 ? 5.5f : c.cameraDistance < 7 ? 7.5f : 4f);
    add(
        x + 160,
        y + 50,
        "Shoulder: " + (c.shoulderOffset > 0 ? "Right" : "Left"),
        () -> c.shoulderOffset = -c.shoulderOffset);
    add(
        x,
        y + 75,
        "Sky & ambient particles: " + on(c.atmosphere),
        () -> c.atmosphere = !c.atmosphere);
    add(
        x + 160,
        y + 75,
        "Reduced motion: " + on(c.reducedMotion),
        () -> c.reducedMotion = !c.reducedMotion);
    add(x, y + 100, "Low health effects: " + on(c.lowHealth), () -> c.lowHealth = !c.lowHealth);
    addDrawableChild(
        ButtonWidget.builder(Text.literal("Done"), b -> close())
            .dimensions(width / 2 - 75, y + 133, 150, 20)
            .build());
  }

  private String on(boolean v) {
    return v ? "On" : "Off";
  }

  private void add(int x, int y, String text, Runnable action) {
    addDrawableChild(
        ButtonWidget.builder(
                Text.literal(text),
                b -> {
                  action.run();
                  AtlasConfig.INSTANCE.save();
                  clearAndInit();
                })
            .dimensions(x, y, 150, 20)
            .build());
  }

  @Override
  public void close() {
    client.setScreen(parent);
  }

  @Override
  public void render(DrawContext context, int mouseX, int mouseY, float delta) {
    super.render(context, mouseX, mouseY, delta);
    context.drawCenteredTextWithShadow(textRenderer, title, width / 2, 12, 0xffffff);
    context.drawCenteredTextWithShadow(
        textRenderer,
        Text.literal("F5 Free · F6 Shoulder · F7 Detached · C Dodge · R Polarity · V Boots"),
        width / 2,
        height - 18,
        0xaaaaaa);
  }
}
