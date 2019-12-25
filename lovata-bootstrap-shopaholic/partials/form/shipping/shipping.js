export default new class Shipping {

  constructor() {
    this.formClass = '_ajax_create_order';
    this.cityClass = '_js_cdek_city_select';
    this.pvzClass = '_js_cdek_pvz';
    this.cdekClass = '_js_cdek_type';
    this.listClass = '_js_shipping_types';
    this.addressClass = '_js_address_block';
    this.modalClass = '_js_cdek_modal';
    this.pvzGroupClass = '_js_cdek_pvz_group';
    this.eventHandlers();
  }

  eventHandlers() {

    const _self = this;
    _self.$city = $(`.${_self.cityClass}`);

    if (!_self.$city.length) {
      return;
    }

    _self.$form = $(`.${_self.formClass}`);
    _self.$checked = $(':checked', this.$form);
    _self.$modal = $(`.${_self.modalClass}`);
    _self.$pvzGroup = $(`.${_self.pvzGroupClass}`);
    _self.$addrGroup = $(`.${_self.addressClass}`);

    _self.createAutoSuggest();
    _self.modalShown();
    _self.watchShipping();
  }

  createAutoSuggest() {
    const _self = this;
    this.$city.select2({
      ajax: {
        url: "https://api.cdek.ru/city/getListByTerm/jsonp.php",
        dataType: 'jsonp',
        type: "GET",
        delay: 250,
        data: function (params) {
          return {
            q: params.term
          };
        },
        processResults: function (data) {
          data.geonames = $.map(data.geonames, function (obj) {
            obj.text = obj.name;
            return obj;
          });
          return {
            results: data.geonames
          };
        },
        cache: true
      },
      minimumInputLength: 2
    }).on('change', function() {
      _self.updateCity();
    });

    if(this.$city.val() && this.$city.select2('data').length) {
      _self.updateCity();
    }
  }

  updateCity() {
    $(':submit', this.$form).prop('disabled', true);
    const _self = this;
    $.request('CdekShipping::onCityUpdate', {
      data: {
        order: { property: { city_id: this.$city.val() } },
        shipping_type_id: $('[name="shipping_type_id"]:checked', this.$form).val(),
        city_data: this.getCityData()
      },
      loading: $.oc.stripeLoadIndicator,
      update: {
        'form/shipping/shipping-types': '.'+this.listClass,
      },
      success: function(r) {
        _self.activePoint = false;
        if(!r.status) {
          $.oc.flashMsg({ text: r.message, class: 'error' });
        }
        _self.updateMap(r.data ? r.data.pvzOffices : []);
        _self.updatePvzSelect(r.data ? r.data.pvzOffices : []);
        $('[name="order[property][pvz_code]"]', _self.$form).val('');
        this.success(r);
        _self.updateTotal();
        _self.$form.trigger('cdek:update');
      },
      complete: function() {
        $(':submit', _self.$form).prop('disabled', false);
      }
    });
  }

  modalShown() {
    const _self = this;
    _self.$modal.on('shown.bs.modal', function (e) {
      if(!_self.zoom) return;
      _self.map.setBounds( _self.cluster.getBounds(), { checkZoomRange:true }).then(function() {
        if(_self.map.getZoom() > 10) _self.map.setZoom(10);
      });
      _self.zoom = false;
    });
  }

  updateTotal() {
    this.$checked = $('[name="shipping_type_id"]:checked', this.$form);
    if(this.$checked.is(':disabled')) {
      this.$checked.prop('checked', false);
      $('[name="shipping_type_id"]', this.$form).not(':disabled')
        .first().prop('checked', true).trigger('change');
    } else {
      this.$checked.trigger('change');
    }
  }

  watchShipping() {
    const _self = this;
    this.$form.on('change cdek:update').on('change', '[name="shipping_type_id"]', function() {
      if(!this.checked) return;
      const $el = $(this);
      const isCdek = $el.hasClass(_self.cdekClass);
      const isPvz = $el.hasClass(_self.pvzClass);
      _self.$city.prop('required', isCdek);
      _self.$pvzGroup[isPvz ? 'show' : 'hide']().find('select').prop('required', isPvz);
      $('[name="order[property][shipping_tariff_id]"]', _self.$form).val($el.data('tariff_id'));
      _self.$addrGroup[isPvz ? 'hide' : 'show']().find(
        'input:not([name="order[property][flat]"])'
      ).prop('required', isCdek && !isPvz);
    });
  }

  updatePvzSelect(offices) {
    const $select = this.$pvzGroup.find('select').empty();
    $.each(offices, function(idx, office) {
      $select.append(
        $('<option/>', {
          text: '#'+office.code.replace(/[^0-9]/g, '')+': '+office.address,
          value: office.code
        })
      );
    });
  }

  getCityData() {
    if(!this.$city.select2('data').length) {
      return {};
    }
    const data = {};
    $.each(this.$city.select2('data')[0], function(param, value) {
      if(typeof value !== 'string' && typeof value !== 'number') {
        return;
      }
      data[param] = value;
    });
    return data;
  }

  initMap() {
    const _self = this;
    _self.cluster = new ymaps.Clusterer({
      preset: 'islands#invertedDarkGreenClusterIcons',
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      clusterOpenBalloonOnClick: false
    });
    _self.cluster.events.add('click', function (e) {
      if(typeof e.get('target').getGeoObjects === "undefined") {
        _self.$pvzGroup.find('option').prop('selected', false).filter(
          '[value="'+e.get('target').properties.get('office').code+'"]'
        ).prop('selected', true);
        _self.$modal.modal('hide');
      }
    });
    _self.map = new ymaps.Map("cdek-map", {
      center: [50, 50],
      zoom: 15,
      controls: ['zoomControl', 'fullscreenControl']
    });
    _self.map.geoObjects.add( _self.cluster );
  }

  updateMap(offices) {
    const _self = this;
    ymaps.ready(function () {
      if(!_self.map) {
        _self.initMap();
      }
      _self.cluster.removeAll();
      offices.forEach(function(office) {
        const placemark = new ymaps.GeoObject({
          geometry: {
            type: "Point",
            coordinates: [office.coord_y, office.coord_x]
          },
          properties: {
            iconContent: office.code.replace(/[^0-9]/g, ''),
            hintContent: office.address+'<br>'+office.phone+'<br>'+office.work_time,
            office: office
          }
        }, {
          preset: 'islands#darkGreenStretchyIcon',
          draggable: false
        });
        _self.cluster.add(placemark);
      });
      _self.map.geoObjects.add( _self.cluster );
      _self.zoom = true;
    });
  }
}();
