function set32Int2Array(array, begin, size, value, little_endian=true){
    let u32 = new Uint32Array(1);
    u32[0] = parseInt(value);
    let target = new array.constructor(u32.buffer);
    let actual_size = 0;
    for(let i of target){
        if(i > 0){
            actual_size++;
        }
    }
    if(actual_size > size){
        console.warn(`${value} to ${array} with ${size} will lose`);
    }
    let k = 0;
    if(little_endian){
        for(let i=begin; i < begin+size; i++){
            array[i] = target[k++];
        }
    }else{
        for(let i=begin+size-1; i >= begin; i--){
            array[i] = target[k++];
        }
    }
    
    return array;
}

/**
 * flexible code sizes array
 */
class FlexSizeByteArray{
    constructor(){
        this.bytes_array = [];
        this.left_size = 0;
    }

    add(value, size){
        if(this.left_size == 0){
            this.bytes_array.push(0);
            this.left_size = 8;
            return this.add(value, size);
        }
        if(this.left_size >= size){
            value = value << (8 - this.left_size);
            this.bytes_array[this.bytes_array.length-1] |= value;
            this.left_size -= size;
            return;
        } else {
            let left = value >> this.left_size;
            let left_size = size - this.left_size;
            this.add(value, this.left_size);
            return this.add(left, left_size);
        }
    }

    toArray(){
        return new Uint8Array(this.bytes_array);
    }
}

class LZWEncoder{
    constructor(min_code_size, color_count){
        this.min_code_size = min_code_size;
        if(min_code_size < 2 || min_code_size > 8){
            throw new Error(`Illegal min_code_size: ${min_code_size}, must be bigger than 1, less than 9`);
        }
        let table_size = (1 << min_code_size) - 1;
        this.clear_code = table_size + 1;
        this.end_of_infomation_code = table_size + 2;
        this.code_table = {};
        this.code_index = -1;
        for(let i=0; i < color_count; i++){
            this.code_table[i] = i;
            this.code_index++;
        }
    }

    encode(indices){
        let code_bits = this.min_code_size + 1;
        let code_stream = new FlexSizeByteArray();

        code_stream.add(this.clear_code, code_bits);

        let index_buffer=indices[0];
        for(let k=1; k <= indices.length; k++){
            let cur = "" + index_buffer + indices[k];
            if(this.code_table[cur]){
                index_buffer = cur;
            }else{
                // skip clear code and end of infomation code
                if(this.code_index + 1 == this.clear_code){
                    this.code_index += 2;
                }
                // put new code into table
                this.code_table[cur] = ++this.code_index;

                // console.log(this.code_table[index_buffer]);

                code_stream.add(this.code_table[index_buffer], code_bits);

                // not quite sure here
                // increase the code size when the second code that bigger than current code size appeared
                if(this.code_index-1 == (1 << code_bits) - 1){
                    code_bits++;
                }
                index_buffer = indices[k];
            }
        }
        code_stream.add(this.end_of_infomation_code, code_bits);
        return code_stream.toArray();
    }
};

class GIF{
    constructor(screen_width, screen_height){
        this.header = new Uint8Array(6);
        this.header[0] = 'G'.charCodeAt(0);
        this.header[1] = 'I'.charCodeAt(0);
        this.header[2] = 'F'.charCodeAt(0);
        this.header[3] = '8'.charCodeAt(0);
        this.header[4] = '9'.charCodeAt(0);
        this.header[5] = 'a'.charCodeAt(0);
        this.gifDataStream = null;
        this.gct = null;
        this.screen_width = screen_width;
        this.screen_height = screen_height;
        this.frames = [];
    }

    /**
     * @param {boolean} gct_flag Global Color Table Flag, ture is Enable
     * @param {uint} cr Color Resolution, 0 < cr <= 7, when > 7 it will be set to 7
     * @param {boolean} sf Sort Flag, wether sort the Global Color Table
     * @param {int} pixel the size of Golbal Color Table, number of colors = pow(2, pixel+1)
     * @param {int} background background color index in Global Color Table, use when gct_flag===true
     * @param {int} pixel_aspect_ratio 
     */
    setDataStream(gct_flag, cr, sf, pixel, background, pixel_aspect_ratio){
        this.gifDataStream = new Uint8Array(7);
        set32Int2Array(this.gifDataStream, 0,2, this.screen_width);
        set32Int2Array(this.gifDataStream, 2,2, this.screen_height);
        let b = 0;
        if(gct_flag){
            b |= 128;
        }
        if(cr > 7){
            cr = 7;
        }
        b |= cr << 4;
        if(sf){
            b |= 8;
        }
        if(pixel > 7){
            pixel = 7;
        }
        b |= pixel;
        set32Int2Array(this.gifDataStream, 4,1, b);
        set32Int2Array(this.gifDataStream, 5,1, background);
        set32Int2Array(this.gifDataStream, 6,1, pixel_aspect_ratio);
    }

    /**
     * 
     * @param {Array} colors must be like
     * [
     *   [R,G,B],
     *   [R,G,B],
     *   ...
     * ]
     */
    setGolbalColorTable(colors){
        this.gct = new Uint8Array(colors.length*3);
        for(let i=0; i < colors.length; i++){
            this.gct[i*3] = colors[i][0];
            this.gct[i*3+1] = colors[i][1];
            this.gct[i*3+2] = colors[i][2];
        }
    }

    /**
     * 
     * @param {uint} loop_count how many times the animation should repeat, 0 mean loop forever 
     */
    setApplicationExtension(loop_count=0){
        this.ape = new Uint8Array(19);
        set32Int2Array(this.ape, 0, 1, 33); // GIF Extension Code
        set32Int2Array(this.ape, 1, 1, 255); // Application Extension Label
        set32Int2Array(this.ape, 2, 1, 11); // Length of Application Block
        set32Int2Array(this.ape, 3, 4,  1313166419, false); // NETS
        set32Int2Array(this.ape, 7, 4,  1128353861, false); // CAPE
        set32Int2Array(this.ape, 11, 3,  3288624, false); // 2.0
        set32Int2Array(this.ape, 14, 1,  3); // Sub-Block Length
        set32Int2Array(this.ape, 15, 1,  1); // fixed 1
        set32Int2Array(this.ape, 16, 2,  loop_count);
        // terminator always 0
    }

    /**
     * 
     * @param {uint} delay_time  hundredths of a second 
     */
    getGraphicControl(delay_time){
        let graphic_control = new Uint8Array(8);
        set32Int2Array(graphic_control, 0, 1, 33);
        set32Int2Array(graphic_control, 1, 1, 249);
        set32Int2Array(graphic_control, 2, 1, 4);
        set32Int2Array(graphic_control, 3, 1, 8); // Packed Field disposal method 2 restore to backgroud every image
        set32Int2Array(graphic_control, 4, 2, delay_time);
        // Packed Field 0 mean Transparent disabled, transparent color index useless
        // block terminator always 0
        return graphic_control;
    }

    getImageDescriptor(){
        let image_descriptor = new Uint8Array(10);
        set32Int2Array(image_descriptor, 0, 1, 44);
        // position are  (0, 0)
        set32Int2Array(image_descriptor, 5, 2, this.screen_width);
        set32Int2Array(image_descriptor, 7, 2, this.screen_height);
        // local color table disabled, 0
        return image_descriptor;
    }

    /**
     * 
     * @param {list} frame 3d array represent RGB on each pixel
     * [
     *      [[R,G,B], [R,G,B], ...],
     *      [[R,G,B], [R,G,B], ...],
     *      ...
     * ]
     */
    addFrame(frame){
        this.frames.push(frame);
    }

    render(){
        // get global color table
        let colors = [
            [255,255,255],
            [0,0,0]
        ];
        let color_map = {
            "255,255,255":0,
            "0,0,0":1
        };
        colors.push();
        for(let frame of this.frames){
            for(let row of frame){
                for(let color of row){
                    if(color_map[""+color] === undefined){
                        color_map[""+color] = colors.length;
                        colors.push(color);
                    }
                }
            }
        }
        // calculate the size of global color table
        let l =  colors.length;
        let gcts = -1;
        while(l >> 1 > 0){
            l >>= 1;
            gcts++;
        }

        this.setDataStream(true, 1, false, gcts, 0, 0);

        this.setGolbalColorTable(colors);
        console.log("color table finished");
        this.setApplicationExtension(0);

        let image_datas = [];
        for(let frame of this.frames){
            let graphic_control = this.getGraphicControl(100);
            let image_descriptor = this.getImageDescriptor();
            let image_data = null;

            let lzw = new LZWEncoder(2, colors.length);
            let indices = [];
            for(let row of frame){
                for(let color of row){
                    indices.push(color_map[""+color]);
                }
            }
            image_data = lzw.encode(indices);
            image_datas.push([graphic_control, image_descriptor, [2, image_data.length], image_data, [0]]);
        }
        console.log("image data finished");

        let out = [
            this.header,
            this.gifDataStream,
            this.gct,
            this.ape
        ];
        for(let frame of image_datas){
            for(let block of frame){
                out.push(new Uint8Array(block));
            }
        }
        out.push(new Uint8Array([59]));
        return new Blob(out, {type:"image/gif"});
    }
}