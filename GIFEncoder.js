function set32Int2Array(array, begin, size, value){
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
    for(let i=begin; i < begin+size; i++){
        array[i] = target[k++];
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
                    console.log("+")
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

    getGraphicControl(delay_time){
        let graphic_control = new Uint8Array(8);
        set32Int2Array(graphic_control, 0, 1, 33);
        set32Int2Array(graphic_control, 1, 1, 249);
        set32Int2Array(graphic_control, 2, 1, 4);
        // Packed Field 0
        set32Int2Array(graphic_control, 4, 2, delay_time);
        set32Int2Array(graphic_control, 0, 1, 33);
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
        let byte_length = 6;
        // get global color table
        let colors = [[255,255,255]];
        let color_map = {
            "255,255,255":0
        };
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
        color_map["0,0,0"] = colors.length;
        colors.push([0,0,0]);
        // calculate the size of global color table
        let l =  colors.length;
        let gcts = -1;
        while(l >> 1 > 0){
            l >>= 1;
            gcts++;
        }

        this.setDataStream(true, 1, false, gcts, 0, 0);
        byte_length += 7;
        this.setGolbalColorTable(colors);
        byte_length += colors.length*3;
        console.log("color table finished");

        let image_datas = [];
        for(let frame of this.frames){
            let graphic_control = this.getGraphicControl(0);
            byte_length += 8;
            let image_descriptor = this.getImageDescriptor();
            byte_length += 10;
            let image_data = null;

            let lzw = new LZWEncoder(2, colors.length);
            let indices = [];
            for(let row of frame){
                for(let color of row){
                    indices.push(color_map[""+color]);
                }
            }
            image_data = lzw.encode(indices);
            byte_length += image_data.length + 3;
            image_datas.push([graphic_control, image_descriptor, [2, image_data.length], image_data, [0]]);
        }
        console.log("image data finished");
        let binary = new Uint8Array(byte_length+1);
        let i = 0;

        for(let b of this.header){
            binary[i++] = b;
        }
        for(let b of this.gifDataStream){
            binary[i++] = b;
        }
        for(let b of this.gct){
            binary[i++] = b;
        }
        for(let frame of image_datas){
            for(let block of frame){
                for(let b of block){
                    binary[i++] = b;
                }
            }
        }
        binary[byte_length] = 59;
        return binary;
    }
}