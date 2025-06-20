const { GObject, Clutter, St, GLib } = imports.gi;
const { panelMenu, popupMenu } = imports.ui;
const { getCurrentExtension } = imports.misc.extensionUtils;
const AppManager = getCurrentExtension().imports.AppManager;

var TrayIndicator = GObject.registerClass(
  class TrayIndicator extends panelMenu.Button {
    _init(settings) {
      log('_init TrayIndicator.js')
      this._icons = [];

      super._init(0.0, null, false);
      this._settings = settings;
      this._appManager = new AppManager.AppManager(this._settings);
      this._overflow = false;

      this._indicators = new St.BoxLayout();
      this.add_child(this._indicators);

      this._icon = new St.Icon({
        icon_name: "view-more-horizontal",
        style_class: "system-status-icon",
        reactive: true,
        track_hover: true,
      });
      this._indicators.add_child(this._icon);
      this._queue_relayout();

      this._menuItem = new popupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: true,
      });
      this.menu.addMenuItem(this._menuItem);
      this.menu.actor.add_style_class_name("TrayIndicatorPopup");
      this.hide();
    }

    get size() {
      const context = St.ThemeContext.get_for_stage(global.stage);
      return this._size * context.scale_factor;
    }

    setSize(size, margin, padding) {
      this._size = size;
      this._margin = margin;
      this._padding = padding;

      this._icons.forEach((icon) => {
        icon.get_parent().style = this._getButtonStyle();
        icon.set_size(this._size, this._size);
      });
    }

    addIcon(icon) {
      const isHidden = this._appManager.getAppSetting(icon, "hidden");
      if (isHidden) return;

      const isAlwaysOnTop = this._appManager.getAppSetting(icon, "alwaysOnTop");
      const button = new St.Button({
        child: icon,
        button_mask:
          St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE,
        style: this._getButtonStyle(),
        style_class: "panel-button",
      });
      icon.opacity = 0;
      icon.set_x_align(Clutter.ActorAlign.CENTER);
      icon.set_y_align(Clutter.ActorAlign.CENTER);
      icon.inOverflow = this._overflow;
      icon.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        icon.set_size(this.size, this.size);
        icon.ease({
          opacity: 255,
          duration: 400,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._addEffectIcon(icon);
        return GLib.SOURCE_REMOVE;
      });
			icon.connect("destroy", () => {
		    try {
	        if (button && button.get_parent()) {
	            button.destroy();
	        }
		    } catch (e) {
	        log('button.destroy() error: ' + e.message);
		    }
		    this._queue_relayout();
			});

      button.connect("button-release-event", (actor, event) => {
        this.menu.close();
        switch (event.get_button()) {
          case 1:
            this._appManager.leftClick(icon, event);
            break;
          case 2:
            this._appManager.middleClick(icon, event);
            break;
          case 3:
            icon.click(event);
            break;
        }
      });

      this._icons.push(icon);

      function isEmpty(value){
        return (value == null || value == '');
      }
      if (this._overflow && ( isAlwaysOnTop == false || isEmpty(isAlwaysOnTop) )) {
        this._menuItem.actor.add_child(button); //this._menuItem.actor.add(button);
      } else {
        //this._indicators.insert_child_at_index(button, 0);
        this._indicators.insert_child_below(button, this._indicators.get_next_sibling());
      }
      this.checkOverflow();
      this._queue_relayout();
    }

    removeIcon(icon, ignoreCheckOverflow) {
      const index = this._icons.indexOf(icon);
      this._icons.splice(index, 1);

      if (icon.timeout) {
        GLib.Source.remove(icon.timeout);
        icon.timeout = null;
      }

      const actor = icon.get_parent();
      actor.remove_actor(icon);
      actor.destroy();

      if (!ignoreCheckOverflow) {
        this.checkOverflow();
      }
      this._queue_relayout();
    }

    checkOverflow() {
      if (this._icons.length >= this._settings.get_int("icons-limit")) {
        this._overflow = true;
        this._icon.visible = true;
        this.reactive = true;
        this.style_class = "panel-button TrayIndicator";
        this._menuItem.show();
      } else {
        this._overflow = false;
        this._icon.visible = false;
        this.reactive = false;
        this.style_class = "TrayIndicator";
        this._menuItem.hide();
      }

      if (this._icons.length) {
        this.show();
      } else {
        this.hide();
      }

      this._refreshIcons(this._overflow);
      this._queue_relayout();
    }

    setEffect(contrast, saturation, brightness) {
      this._icons.forEach((icon) => {
        let brightnessContrast = icon.get_effect("brightnessContrast");
        brightnessContrast.set_contrast(contrast / 100);
        brightnessContrast.set_brightness(brightness / 100);

        let desaturate = icon.get_effect("desaturate");
        desaturate.set_factor(saturation / 100);
      });
    }

    _queue_relayout() {
      log('_queue_relayout TrayIndicator.js')
      if (this._indicators.get_stage()) {
          this._indicators.queue_relayout();
      } else {
         log("_queue_relayout TrayIndicator.js: Box is not in the stage yet, skipping relayout.");
      }
    }

    _refreshIcons(overflow) {
      this._icons.forEach((icon) => {
        if (icon.inOverflow != overflow) {
          this.removeIcon(icon, true);
          this.addIcon(icon);
        }
      });
    }

    _getButtonStyle() {
      let style;
      if (!this._overflow) {
        style = `margin: ${this._margin.vertical}px ${this._margin.horizontal}px; padding: ${this._padding.vertical}px ${this._padding.horizontal}px`;
      }
      return `width: ${this.size}px; height: ${this.size}px;${style}`;
    }

    _addEffectIcon(icon) {
      let brightnessContrast = new Clutter.BrightnessContrastEffect({});
      brightnessContrast.set_contrast(
        this._settings.get_int("icon-contrast") / 100
      );
      brightnessContrast.set_brightness(
        this._settings.get_int("icon-brightness") / 100
      );
      icon.add_effect_with_name("brightnessContrast", brightnessContrast);
      icon.add_effect_with_name(
        "desaturate",
        new Clutter.DesaturateEffect({
          factor: this._settings.get_int("icon-saturation") / 100,
        })
      );
    }

    _onDestroy() {
      this._icons.forEach((icon) => {
        this.removeIcon(icon, true);
      });
    }
  }
);
